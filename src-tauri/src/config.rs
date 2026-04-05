use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub shell: ShellConfig,
    pub appearance: AppearanceConfig,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ShellConfig {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppearanceConfig {
    pub font_family: String,
    pub font_size: u16,
    pub cursor_blink: bool,
    pub scrollback: u32,
    pub theme: ThemeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ThemeConfig {
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub selection_background: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub base_url: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            shell: ShellConfig::default(),
            appearance: AppearanceConfig::default(),
            ai: AiConfig::default(),
        }
    }
}

impl Default for ShellConfig {
    fn default() -> Self {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        Self {
            program: shell,
            args: vec!["-l".to_string()],
        }
    }
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            font_family: "\"SF Mono\", \"Menlo\", \"Monaco\", \"Cascadia Code\", monospace"
                .to_string(),
            font_size: 14,
            cursor_blink: true,
            scrollback: 10000,
            theme: ThemeConfig::default(),
        }
    }
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            background: "#1a1a2e".to_string(),
            foreground: "#e0e0e0".to_string(),
            cursor: "#e0e0e0".to_string(),
            selection_background: "#3a3a5e".to_string(),
        }
    }
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: "anthropic".to_string(),
            model: "claude-sonnet-4-20250514".to_string(),
            base_url: "https://api.anthropic.com".to_string(),
        }
    }
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("aiki")
        .join("config.toml")
}

pub fn load() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(contents) => toml::from_str(&contents).unwrap_or_else(|e| {
            log::warn!("Invalid config at {}: {e}, using defaults", path.display());
            AppConfig::default()
        }),
        Err(_) => AppConfig::default(),
    }
}

pub fn save(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    let contents = toml::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, contents)
        .map_err(|e| format!("Failed to write config: {e}"))
}
