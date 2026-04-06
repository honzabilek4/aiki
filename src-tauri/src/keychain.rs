use keyring::Entry;
use std::collections::HashMap;
use std::sync::Mutex;

const SERVICE: &str = "com.aiki.terminal";

/// In-memory cache so we only hit the Keychain once per provider per session.
/// In dev mode, the binary changes on every rebuild which causes macOS to
/// re-prompt for Keychain access — caching avoids repeated password dialogs.
static CACHE: std::sync::LazyLock<Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn set_api_key(provider: &str, key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, provider).map_err(|e| format!("Keychain error: {e}"))?;
    entry
        .set_password(key)
        .map_err(|e| format!("Failed to store key: {e}"))?;
    CACHE.lock().unwrap().insert(provider.to_string(), key.to_string());
    Ok(())
}

pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    // Check cache first
    if let Some(key) = CACHE.lock().unwrap().get(provider) {
        return Ok(Some(key.clone()));
    }
    // Fall through to Keychain
    let entry = Entry::new(SERVICE, provider).map_err(|e| format!("Keychain error: {e}"))?;
    match entry.get_password() {
        Ok(key) => {
            CACHE.lock().unwrap().insert(provider.to_string(), key.clone());
            Ok(Some(key))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read key: {e}")),
    }
}

pub fn delete_api_key(provider: &str) -> Result<(), String> {
    CACHE.lock().unwrap().remove(provider);
    let entry = Entry::new(SERVICE, provider).map_err(|e| format!("Keychain error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete key: {e}")),
    }
}
