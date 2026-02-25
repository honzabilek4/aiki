mod pty;

use std::sync::Mutex;
use tauri::State;

struct PtySession(Mutex<Option<pty::PtyState>>);

#[tauri::command]
fn pty_spawn(cols: u16, rows: u16, app: tauri::AppHandle, state: State<PtySession>) -> Result<(), String> {
    let session = pty::PtyState::spawn(cols, rows, app)?;
    *state.0.lock().map_err(|e| format!("Lock error: {e}"))? = Some(session);
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
    tauri::Builder::default()
        .manage(PtySession(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![pty_spawn, pty_write, pty_resize])
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
