import { useEffect, useRef, useState } from "react";
import BlockLog from "./components/BlockLog";
import InputBar from "./components/InputBar";
import { useConfig } from "./hooks/useConfig";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  addCommandBlock,
  appendOutput,
  finishBlock,
  addAiBlock,
  updateAiBlock,
  appendAiResponse,
  finishAiBlock,
  getBlocks,
} from "./stores/blockStore";
import { stripOsc } from "./utils/ansi";

async function openSettings() {
  const existing = await WebviewWindow.getByLabel("settings");
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow("settings", {
    url: "index.html?settings",
    title: "Aiki Settings",
    width: 500,
    height: 600,
    resizable: true,
    center: true,
  });
}

function App() {
  const { config } = useConfig();
  const [cwd, setCwd] = useState("~");
  const activeBlockRef = useRef<string | null>(null);
  const capturingRef = useRef(false);
  const shellReadyRef = useRef(false);
  const shellReadyResolveRef = useRef<(() => void) | null>(null);
  const ptySpawnedRef = useRef(false);

  // Cmd+, and menu item open settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    let unlistenMenu: (() => void) | undefined;
    listen("open-settings", () => openSettings()).then((fn) => {
      unlistenMenu = fn;
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenMenu?.();
    };
  }, []);

  // Auto-open settings if no API key configured
  useEffect(() => {
    if (config) {
      invoke<boolean>("has_api_key", { provider: config.ai.provider }).then(
        (has) => { if (!has) openSettings(); }
      );
    }
  }, [config]);

  useEffect(() => {
    let cancelled = false;

    // Spawn shell eagerly so init happens while user sees the UI
    if (!ptySpawnedRef.current) {
      ptySpawnedRef.current = true;
      invoke("pty_spawn", { cols: 120, rows: 40 });
    }

    async function setup() {
      // Listen for AI stream events
      const unlistenAi = await listen<{ block_id: string; kind: string; content: string }>(
        "ai-stream",
        (event) => {
          const { block_id, kind, content } = event.payload;
          if (kind === "delta") {
            appendAiResponse(block_id, content);
          } else if (kind === "done") {
            finishAiBlock(block_id);
          } else if (kind === "error") {
            updateAiBlock(block_id, { response: `Error: ${content}` });
            finishAiBlock(block_id);
          }
        }
      );

      const unlistenOutput = await listen<number[]>("pty-output", (event) => {
        const bytes = new Uint8Array(event.payload);
        const raw = new TextDecoder().decode(bytes);
        const segments = parseOscStream(raw);

        for (const seg of segments) {
          if (seg.type === "command-start") {
            capturingRef.current = true;
            continue;
          }
          if (seg.type === "command-done") {
            capturingRef.current = false;
            if (activeBlockRef.current) {
              finishBlock(activeBlockRef.current, seg.exitCode);
              activeBlockRef.current = null;
            }
            continue;
          }
          if (seg.type === "prompt") {
            // First prompt = shell is ready after init
            if (!shellReadyRef.current) {
              shellReadyRef.current = true;
              shellReadyResolveRef.current?.();
              shellReadyResolveRef.current = null;
            }
            continue;
          }
          if (seg.type === "cwd") {
            setCwd(seg.path);
            continue;
          }
          if (seg.type === "output" && seg.text) {
            if (activeBlockRef.current && capturingRef.current) {
              const cleaned = stripOsc(seg.text);
              if (cleaned) {
                appendOutput(activeBlockRef.current, cleaned);
              }
            }
          }
        }
      });

      const unlistenExit = await listen("pty-exit", () => {
        if (activeBlockRef.current) {
          finishBlock(activeBlockRef.current, -1);
          activeBlockRef.current = null;
        }
      });

      if (cancelled) {
        unlistenAi();
        unlistenOutput();
        unlistenExit();
      }

      return () => {
        unlistenAi();
        unlistenOutput();
        unlistenExit();
      };
    }

    const cleanup = setup();
    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  if (!config) return null;

  const ensureShellReady = async () => {
    if (!shellReadyRef.current) {
      await new Promise<void>((resolve) => {
        shellReadyResolveRef.current = resolve;
      });
    }
  };

  const handleShellCommand = async (command: string) => {
    await ensureShellReady();

    const id = addCommandBlock(command, "~");
    activeBlockRef.current = id;

    await invoke("pty_write", { data: command + "\n" });
  };

  const handleAiPrompt = async (prompt: string, commandLike: boolean) => {
    const hasKey = await invoke<boolean>("has_api_key", { provider: config.ai.provider });
    if (!hasKey) {
      openSettings();
      return;
    }

    const id = addAiBlock(prompt);

    // Build messages with block context
    const blocks = getBlocks();
    const contextBlocks = blocks
      .filter((b) => b.id !== id)
      .slice(-20);

    const MAX_CONTEXT = 12000; // rough char budget for context
    let contextSize = 0;

    const context = contextBlocks
      .map((b) => {
        if (b.type === "command") {
          let output = b.output;
          // Keep head + tail so errors at the end aren't lost
          if (output.length > 3000) {
            output = output.slice(0, 1500) + "\n…[truncated]…\n" + output.slice(-1500);
          }
          const duration = b.finishedAt && b.startedAt
            ? `${((b.finishedAt - b.startedAt) / 1000).toFixed(1)}s`
            : "running";
          const exit = b.exitCode !== null ? ` [exit ${b.exitCode}]` : "";
          return `[${b.cwd}] $ ${b.command}  (${duration}${exit})\n${output}`;
        }
        if (b.type === "ai") {
          return `user> ${b.prompt}\nassistant> ${b.response}`;
        }
        return "";
      })
      .filter(Boolean)
      .reverse()
      .filter((text) => {
        // Take blocks from most recent until budget is exhausted
        if (contextSize + text.length > MAX_CONTEXT) return false;
        contextSize += text.length;
        return true;
      })
      .reverse()
      .join("\n\n");

    const systemPrompt = commandLike
      ? `You are Aiki, an AI terminal assistant. The user typed something that looks like a shell command but the binary was not found. Help them — suggest the correct command, explain what might be wrong, or answer their question. Be concise. Current directory: ${cwd}`
      : `You are Aiki, an AI terminal assistant. Help the user with their terminal tasks. Be concise and practical. Current directory: ${cwd}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(context ? [{ role: "user", content: `Recent terminal session:\n${context}` }] : []),
      { role: "user", content: prompt },
    ];

    try {
      await invoke("ai_chat", { blockId: id, messages });
    } catch (err) {
      updateAiBlock(id, { response: `Error: ${err}` });
      finishAiBlock(id);
    }
  };

  return (
    <>
      <div data-tauri-drag-region className="titlebar" />
      <BlockLog />
      <InputBar cwd={cwd} aiModel={config.ai.model} onShellCommand={handleShellCommand} onAiPrompt={handleAiPrompt} />
    </>
  );
}

type Segment =
  | { type: "output"; text: string }
  | { type: "command-start" }
  | { type: "command-done"; exitCode: number }
  | { type: "prompt" }
  | { type: "cwd"; path: string };

function parseOscStream(raw: string): Segment[] {
  const segments: Segment[] = [];
  // Match OSC 133 (shell integration) and OSC 7 (cwd) sequences
  const re = /\x1b\](?:133;([A-Z])(?:;([^\x07]*))?|7;file:\/\/[^/]*([^\x07]*))\x07/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "output", text: raw.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // OSC 133
      const marker = match[1];
      const params = match[2] || "";

      if (marker === "C") {
        segments.push({ type: "command-start" });
      } else if (marker === "D") {
        const exitCode = parseInt(params, 10) || 0;
        segments.push({ type: "command-done", exitCode });
      } else if (marker === "A") {
        segments.push({ type: "prompt" });
      }
    } else if (match[3] !== undefined) {
      // OSC 7 — cwd
      segments.push({ type: "cwd", path: decodeURIComponent(match[3]) });
    }

    lastIndex = re.lastIndex;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: "output", text: raw.slice(lastIndex) });
  }

  return segments;
}

export default App;
