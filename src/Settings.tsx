import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { AiConfig, AppConfig } from "./hooks/useConfig";
import { PROVIDERS, filterChatModels } from "./providers";

export default function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [providerId, setProviderId] = useState("");
  const [configuredProvider, setConfiguredProvider] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [keyDirty, setKeyDirty] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [keyError, setKeyError] = useState("");
  const [modelError, setModelError] = useState("");

  const provider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0];
  const isLocal = providerId === "ollama" || providerId === "lmstudio";

  const resolveBaseUrl = (pid: string): string => {
    return PROVIDERS.find((p) => p.id === pid)?.baseUrl ?? "";
  };

  useEffect(() => {
    invoke<AppConfig>("get_config").then((cfg) => {
      setConfig(cfg);
      setProviderId(cfg.ai.provider);
      setConfiguredProvider(cfg.ai.provider);
      setModel(cfg.ai.model);
      loadKeyAndModels(cfg.ai.provider, cfg.ai.model);
    });
  }, []);

  const loadKeyAndModels = async (pid: string, savedModel?: string) => {
    const baseUrl = resolveBaseUrl(pid);
    try {
      const has = await invoke<boolean>("has_api_key", { provider: pid });
      setHasKey(has);
      if (has) {
        const k = await invoke<string | null>("get_api_key", { provider: pid });
        if (k) {
          setKeyValue(k);
          setKeyDirty(false);
          fetchModels(pid, baseUrl, k, savedModel);
          return;
        }
      }
    } catch (err) {
      setKeyError(`Keychain error: ${err}`);
    }
    setKeyValue("");
  };

  const fetchModels = async (pid: string, baseUrl: string, apiKey: string, currentModel?: string) => {
    setLoadingModels(true);
    setModelError("");
    try {
      const result = await invoke<string[]>("list_models", { provider: pid, baseUrl, apiKey });
      const filtered = pid === "ollama" || pid === "lmstudio"
        ? result.sort()
        : filterChatModels(result, pid);
      setModels(filtered);
      if (filtered.length > 0 && (!currentModel || !filtered.includes(currentModel))) {
        setModel(filtered[0]);
      }
    } catch (err) {
      setModels([]);
      setModelError(String(err));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleProviderChange = async (id: string) => {
    setProviderId(id);
    setModel("");
    setModels([]);
    setKeyValue("");
    setKeyDirty(false);
    setError("");
    setKeyError("");
    setModelError("");
    setSaved(false);

    if (id === "ollama" || id === "lmstudio") {
      setHasKey(false);
      fetchModels(id, resolveBaseUrl(id), "");
    } else {
      await loadKeyAndModels(id);
    }
  };

  const handleKeyUpdate = async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) return;
    setKeyError("");
    try {
      await invoke("set_api_key", { provider: providerId, key: trimmed });
      setHasKey(true);
      setKeyDirty(false);
      fetchModels(providerId, provider.baseUrl, trimmed);
    } catch (err) {
      setKeyError(String(err));
    }
  };

  const handleSave = async () => {
    if (!config || !model) return;

    setSaving(true);
    setError("");
    try {
      // Save key if it was changed
      const trimmed = keyValue.trim();
      if (trimmed && keyDirty && !isLocal) {
        await invoke("set_api_key", { provider: providerId, key: trimmed });
        setHasKey(true);
        setKeyDirty(false);
      }

      const aiConfig: AiConfig = {
        provider: providerId,
        model,
        base_url: provider.baseUrl,
      };
      await invoke("set_config", { newConfig: { ...config, ai: aiConfig } });
      await emit("config-changed");
      setConfiguredProvider(providerId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!config) return null;

  const selectOptions = models.includes(model)
    ? models
    : model ? [model, ...models] : models;

  return (
    <div className="settings">
      <div className="settings-titlebar" data-tauri-drag-region />

      <div className="settings-content">
        <h1 className="settings-title">Settings</h1>

        {/* Provider */}
        <section className="settings-section">
          <h2 className="settings-label">Provider</h2>
          <div className="setup-provider-grid">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`setup-provider-btn ${providerId === p.id ? "setup-provider-btn--selected" : ""}`}
                onClick={() => handleProviderChange(p.id)}
              >
                {p.name}
                {p.id === configuredProvider && (
                  <span className="setup-provider-active"> ✓</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        {!isLocal && (
          <section className="settings-section">
            <h2 className="settings-label">API Key</h2>
            <div className="settings-key-row">
              <input
                type="password"
                className="api-key-setup-input"
                value={keyValue}
                onChange={(e) => { setKeyValue(e.target.value); setKeyDirty(true); }}
                onKeyDown={(e) => e.key === "Enter" && handleKeyUpdate()}
                placeholder="Paste API key..."
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="api-key-setup-btn"
                disabled={!keyValue.trim()}
                onClick={handleKeyUpdate}
              >
                Update
              </button>
            </div>
            {keyError && <div className="api-key-setup-error">{keyError}</div>}
          </section>
        )}

        {/* Model */}
        <section className="settings-section">
          <h2 className="settings-label">Model</h2>
          {loadingModels ? (
            <div className="setup-loading">Fetching models...</div>
          ) : (
            <select
              className="settings-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {selectOptions.length === 0 && (
                <option value="">
                  {hasKey || isLocal ? "No models found" : "Enter API key and click Update"}
                </option>
              )}
              {selectOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {modelError && <div className="api-key-setup-error">{modelError}</div>}
        </section>

      </div>

      <div className="settings-footer">
        {saved && <span className="settings-saved"><span className="settings-saved-check">✓</span> Saved</span>}
        {error && <span className="api-key-setup-error">{error}</span>}
        <button
          className="api-key-setup-btn"
          disabled={saving || !model}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
