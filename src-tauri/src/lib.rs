mod ai;
mod config;
mod input;
mod keychain;
mod pty;

use std::sync::Mutex;
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, State};

struct PtySession(Mutex<Option<pty::PtyState>>);
struct ConfigState(Mutex<config::AppConfig>);

#[tauri::command]
fn get_config(state: State<ConfigState>) -> Result<config::AppConfig, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    Ok(guard.clone())
}

#[tauri::command]
fn set_config(new_config: config::AppConfig, state: State<ConfigState>) -> Result<(), String> {
    config::save(&new_config)?;
    let mut guard = state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    *guard = new_config;
    Ok(())
}

#[tauri::command]
fn classify_input(text: String) -> input::InputClassification {
    input::classify(&text)
}

#[tauri::command]
fn pty_spawn(cols: u16, rows: u16, app: tauri::AppHandle, pty_state: State<PtySession>, config_state: State<ConfigState>) -> Result<(), String> {
    let mut guard = pty_state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    if guard.is_some() {
        return Ok(());
    }
    let config = config_state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    let session = pty::PtyState::spawn(cols, rows, app, &config.shell)?;
    *guard = Some(session);
    Ok(())
}

#[tauri::command]
fn pty_write(data: String, state: State<PtySession>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    let session = guard.as_ref().ok_or("No PTY session")?;
    session.write(data.as_bytes())
}

#[tauri::command]
fn pty_resize(cols: u16, rows: u16, state: State<PtySession>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    let session = guard.as_ref().ok_or("No PTY session")?;
    session.resize(cols, rows)
}

#[tauri::command]
fn set_api_key(provider: String, key: String) -> Result<(), String> {
    keychain::set_api_key(&provider, &key)
}

#[tauri::command]
fn get_api_key(provider: String) -> Result<Option<String>, String> {
    keychain::get_api_key(&provider)
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    keychain::delete_api_key(&provider)
}

#[tauri::command]
fn has_api_key(provider: String) -> Result<bool, String> {
    Ok(keychain::get_api_key(&provider)?.is_some())
}

#[tauri::command]
async fn list_models(provider: String, base_url: String, api_key: String) -> Result<Vec<String>, String> {
    ai::list_models(&base_url, &provider, &api_key).await
}

#[tauri::command]
async fn ai_chat(
    block_id: String,
    messages: Vec<ai::ChatMessage>,
    app: tauri::AppHandle,
    config_state: State<'_, ConfigState>,
) -> Result<(), String> {
    let ai_config = {
        let guard = config_state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
        guard.ai.clone()
    };
    ai::stream_chat(app, block_id, messages, &ai_config).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = config::load();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(PtySession(Mutex::new(None)))
        .manage(ConfigState(Mutex::new(app_config)))
        .invoke_handler(tauri::generate_handler![
            pty_spawn, pty_write, pty_resize,
            get_config, set_config, classify_input,
            set_api_key, get_api_key, delete_api_key, has_api_key,
            list_models, ai_chat,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Build macOS menu bar
            let about = AboutMetadataBuilder::new()
                .name(Some("Aiki"))
                .version(Some("0.1.0"))
                .build();

            let settings_item = MenuItemBuilder::with_id("settings", "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_menu = SubmenuBuilder::new(app, "Aiki")
                .item(&PredefinedMenuItem::about(app, Some("About Aiki"), Some(about))?)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id() == "settings" {
                    let _ = handle.emit("open-settings", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
