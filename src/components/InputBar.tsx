import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface InputClassification {
  kind: "Command" | "CommandLike" | "NaturalLanguage";
  binary: string | null;
}

interface InputBarProps {
  cwd: string;
  onShellCommand: (command: string) => void;
  onAiPrompt: (prompt: string, commandLike: boolean) => void;
}

export default function InputBar({ cwd, onShellCommand, onAiPrompt }: InputBarProps) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"idle" | "command" | "ai">("idle");
  const [cursorPos, setCursorPos] = useState(0);
  const [focused, setFocused] = useState(false);
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
    setCursorPos(e.target.selectionStart ?? e.target.value.length);
    classifyValue(e.target.value);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    setCursorPos((e.target as HTMLInputElement).selectionStart ?? 0);
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
    setCursorPos(0);
    setMode("idle");
  };

  const isShell = mode === "command";
  const displayCwd = cwd.replace(/^\/Users\/[^/]+/, "~");

  // Character under cursor (for block cursor display)
  const charUnderCursor = value[cursorPos] || " ";
  const textBefore = value.slice(0, cursorPos);
  const textAfter = value.slice(cursorPos + 1);

  return (
    <div className="input-bar-wrapper">
      <div className="input-bar-cwd">{displayCwd}</div>
      <form className="input-bar" onSubmit={handleSubmit}>
        <span className={`input-bar-sigil ${isShell ? "input-bar-sigil--command" : "input-bar-sigil--ai"}`}>
          {isShell ? "$" : ">"}
        </span>
        <div className="input-bar-field-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="input-bar-field"
            value={value}
            onChange={handleChange}
            onSelect={handleSelect}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={!focused && !value ? "Type a command or ask AI..." : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          {focused && (
            <div className="input-bar-cursor-overlay" aria-hidden>
              <span className="input-bar-cursor-text">{textBefore}</span>
              <span className="input-bar-cursor-block">{charUnderCursor}</span>
              <span className="input-bar-cursor-text">{textAfter}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
