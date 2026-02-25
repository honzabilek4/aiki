use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct PtyState {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    // Must keep child handle alive or the process gets killed on drop
    _child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

impl PtyState {
    pub fn spawn(cols: u16, rows: u16, app: AppHandle) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        // Determine user's shell and spawn as login shell
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");

        // Inherit full environment, then override terminal vars
        for (key, value) in std::env::vars() {
            cmd.env(key, value);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        if let Ok(home) = std::env::var("HOME") {
            cmd.cwd(&home);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {e}"))?;

        // Drop slave side — we only need the master for I/O
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {e}"))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {e}"))?;

        // Background thread: read from PTY, emit to frontend
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = app.emit("pty-exit", ());
                        break;
                    }
                    Ok(n) => {
                        let _ = app.emit("pty-output", buf[..n].to_vec());
                    }
                    Err(e) => {
                        log::error!("PTY read error: {e}");
                        let _ = app.emit("pty-exit", ());
                        break;
                    }
                }
            }
        });

        Ok(Self {
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            _child: Arc::new(Mutex::new(child)),
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        self.writer
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?
            .write_all(data)
            .map_err(|e| format!("PTY write error: {e}"))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY resize error: {e}"))
    }
}
