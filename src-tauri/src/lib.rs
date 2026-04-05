mod config;
mod input;
mod pty;

use std::sync::Mutex;
use tauri::State;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = config::load();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(PtySession(Mutex::new(None)))
        .manage(ConfigState(Mutex::new(app_config)))
        .invoke_handler(tauri::generate_handler![
            pty_spawn, pty_write, pty_resize, get_config, set_config, classify_input
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
