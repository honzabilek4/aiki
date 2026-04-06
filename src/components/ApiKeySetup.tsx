import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiConfig, AppConfig } from "../hooks/useConfig";
import { PROVIDERS, filterChatModels } from "../providers";

interface Props {
  config: AppConfig;
  onComplete: (aiConfig: AiConfig) => void;
}

type Step = "provider" | "key" | "model";

export default function ApiKeySetup({ config, onComplete }: Props) {
  const [step, setStep] = useState<Step>("provider");
  const [providerId, setProviderId] = useState(config.ai.provider);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const provider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0];
  const isLocal = providerId === "ollama" || providerId === "lmstudio";

  const fetchModels = async (pid: string, baseUrl: string, apiKey: string) => {
    setLoadingModels(true);
    try {
      const result = await invoke<string[]>("list_models", { provider: pid, baseUrl, apiKey });
      const filtered = pid === "ollama" || pid === "lmstudio"
        ? result.sort()
        : filterChatModels(result, pid);
      setModels(filtered);
      if (filtered.length > 0) setModel(filtered[0]);
    } catch {
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleProviderSelect = (id: string) => {
    setProviderId(id);
    setKey("");
    setModel("");
    setModels([]);
    setError("");

    if (id === "ollama" || id === "lmstudio") {
      const p = PROVIDERS.find((pr) => pr.id === id)!;
      fetchModels(id, p.baseUrl, "");
      setStep("model");
    } else {
      setStep("key");
    }
  };

  const handleKeySave = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setSaving(true);
    setError("");
    try {
      await invoke("set_api_key", { provider: providerId, key: trimmed });
      fetchModels(providerId, provider.baseUrl, trimmed);
      setStep("model");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = () => {
    if (!model) return;
    onComplete({
      provider: providerId,
      model,
      base_url: provider.baseUrl,
    });
  };

  return (
    <div className="api-key-setup">
      <div className="api-key-setup-inner">
        <div className="setup-steps">
          <span className={`setup-step ${step === "provider" ? "setup-step--active" : ""}`}>Provider</span>
          <span className="setup-step-sep">/</span>
          {!isLocal && (
            <>
              <span className={`setup-step ${step === "key" ? "setup-step--active" : ""}`}>API Key</span>
              <span className="setup-step-sep">/</span>
            </>
          )}
          <span className={`setup-step ${step === "model" ? "setup-step--active" : ""}`}>Model</span>
        </div>

        {step === "provider" && (
          <div className="setup-panel">
            <p className="api-key-setup-desc">Choose your AI provider.</p>
            <div className="setup-provider-grid">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`setup-provider-btn ${providerId === p.id ? "setup-provider-btn--selected" : ""}`}
                  onClick={() => handleProviderSelect(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "key" && (
          <div className="setup-panel">
            <p className="api-key-setup-desc">
              Enter your <strong>{provider.name}</strong> API key. Stored in macOS Keychain.
            </p>
            <input
              type="password"
              className="api-key-setup-input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleKeySave()}
              placeholder="Paste API key..."
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            {error && <div className="api-key-setup-error">{error}</div>}
            <div className="setup-actions">
              <button className="setup-back-btn" onClick={() => setStep("provider")}>Back</button>
              <button
                className="api-key-setup-btn"
                disabled={saving || !key.trim()}
                onClick={handleKeySave}
              >
                {saving ? "Saving..." : "Next"}
              </button>
            </div>
          </div>
        )}

        {step === "model" && (
          <div className="setup-panel">
            <p className="api-key-setup-desc">
              {loadingModels
                ? "Fetching available models..."
                : models.length > 0
                  ? `Select a model for ${provider.name}.`
                  : `Type a model ID for ${provider.name}.`}
            </p>
            {models.length > 0 ? (
              <select
                className="settings-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : !loadingModels ? (
              <input
                type="text"
                className="api-key-setup-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFinish()}
                placeholder="Type a model ID..."
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
            ) : null}
            {loadingModels && <div className="setup-loading">Loading...</div>}
            <div className="setup-actions">
              <button className="setup-back-btn" onClick={() => setStep(isLocal ? "provider" : "key")}>Back</button>
              <button
                className="api-key-setup-btn"
                disabled={loadingModels || !model}
                onClick={handleFinish}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
