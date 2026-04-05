import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ThemeConfig {
  background: string;
  foreground: string;
  cursor: string;
  selection_background: string;
}

export interface AppearanceConfig {
  font_family: string;
  font_size: number;
  cursor_blink: boolean;
  scrollback: number;
  theme: ThemeConfig;
}

export interface ShellConfig {
  program: string;
  args: string[];
}

export interface AiConfig {
  provider: string;
  model: string;
  base_url: string;
}

export interface AppConfig {
  shell: ShellConfig;
  appearance: AppearanceConfig;
  ai: AiConfig;
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config").then(setConfig);
  }, []);

  const updateConfig = async (newConfig: AppConfig) => {
    await invoke("set_config", { newConfig });
    setConfig(newConfig);
  };

  return { config, updateConfig };
}
