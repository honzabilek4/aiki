import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface InputClassification {
  kind: "Command" | "CommandLike" | "NaturalLanguage";
  binary: string | null;
}

interface InputBarProps {
  onShellCommand: (command: string) => void;
  onAiPrompt: (prompt: string, commandLike: boolean) => void;
}

export default function InputBar({ onShellCommand, onAiPrompt }: InputBarProps) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"idle" | "command" | "ai">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "l") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const classifyValue = (text: string) => {
    if (!text.trim()) {
      setMode("idle");
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await invoke<InputClassification>("classify_input", { text });
      setMode(result.kind === "NaturalLanguage" || result.kind === "CommandLike" ? "ai" : "command");
    }, 150);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    classifyValue(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    const result = await invoke<InputClassification>("classify_input", { text: trimmed });

    if (result.kind === "Command") {
      onShellCommand(trimmed);
    } else {
      onAiPrompt(trimmed, result.kind === "CommandLike");
    }

    setValue("");
    setMode("idle");
  };

  const isShell = mode === "command";

  return (
    <form className="input-bar" onSubmit={handleSubmit}>
      <span className={`input-bar-sigil ${isShell ? "input-bar-sigil--command" : "input-bar-sigil--ai"}`}>
        {isShell ? "$" : ">"}
      </span>
      <input
        ref={inputRef}
        type="text"
        className="input-bar-field"
        value={value}
        onChange={handleChange}
        placeholder="Type a command or ask AI..."
        spellCheck={false}
        autoComplete="off"
      />
    </form>
  );
}
