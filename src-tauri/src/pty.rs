use crate::config::ShellConfig;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct PtyState {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    _child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

/// Shell integration init script.
/// Sets up preexec/precmd hooks that emit OSC 133 markers so the frontend
/// can detect command boundaries in the persistent shell session.
///
/// Markers:
///   \x1b]133;C\x07       — command is about to execute (preexec)
///   \x1b]133;D;<code>\x07 — previous command finished with exit code (precmd)
///   \x1b]133;A\x07       — prompt start (precmd, after D)
///
/// PS1 is set to empty since we don't render the prompt.
const ZSH_INIT: &str = "stty -echo; unsetopt zle; PS1=''; __aiki_precmd() { printf '\\e]133;D;%d\\a\\e]7;file://%s%s\\a\\e]133;A\\a' $? \"$HOST\" \"$PWD\"; }; __aiki_preexec() { printf '\\e]133;C\\a'; }; autoload -Uz add-zsh-hook; add-zsh-hook precmd __aiki_precmd; add-zsh-hook preexec __aiki_preexec\n";

const BASH_INIT: &str = "stty -echo; PS1=''; __aiki_prompt_command() { local ec=$?; printf '\\e]133;D;%d\\a\\e]7;file://%s%s\\a\\e]133;A\\a' $ec \"$HOSTNAME\" \"$PWD\"; }; trap 'printf \"\\e]133;C\\a\"' DEBUG; PROMPT_COMMAND=__aiki_prompt_command\n";

impl PtyState {
    pub fn spawn(cols: u16, rows: u16, app: AppHandle, shell_config: &ShellConfig) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd = CommandBuilder::new(&shell_config.program);
        for arg in &shell_config.args {
            cmd.arg(arg);
        }

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

        // Inject shell integration hooks after shell starts
        let init_script = if shell_config.program.contains("zsh") {
            ZSH_INIT
        } else {
            BASH_INIT
        };

        let writer_arc = Arc::new(Mutex::new(writer));
        {
            let mut w = writer_arc.lock().map_err(|e| format!("Lock error: {e}"))?;
            w.write_all(init_script.as_bytes())
                .map_err(|e| format!("Failed to write init script: {e}"))?;
        }

        Ok(Self {
            writer: writer_arc,
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
