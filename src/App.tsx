import { useEffect, useRef } from "react";
import BlockLog from "./components/BlockLog";
import InputBar from "./components/InputBar";
import { useConfig } from "./hooks/useConfig";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  addCommandBlock,
  appendOutput,
  finishBlock,
  addAiBlock,
  updateAiBlock,
  finishAiBlock,
} from "./stores/blockStore";
import { stripOsc } from "./utils/ansi";

function App() {
  const { config } = useConfig();
  const activeBlockRef = useRef<string | null>(null);
  const capturingRef = useRef(false);
  const shellReadyRef = useRef(false);
  const shellReadyResolveRef = useRef<(() => void) | null>(null);
  const ptySpawnedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Spawn shell eagerly so init happens while user sees the UI
    if (!ptySpawnedRef.current) {
      ptySpawnedRef.current = true;
      invoke("pty_spawn", { cols: 120, rows: 40 });
    }

    async function setup() {
      const unlistenOutput = await listen<number[]>("pty-output", (event) => {
        const bytes = new Uint8Array(event.payload);
        const raw = new TextDecoder().decode(bytes);
        const segments = parseOsc133(raw);

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
        unlistenOutput();
        unlistenExit();
      }

      return () => {
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

  const handleAiPrompt = (prompt: string, _commandLike: boolean) => {
    const id = addAiBlock(prompt);
    setTimeout(() => {
      updateAiBlock(id, { thinking: "Analyzing the request..." });
    }, 300);
    setTimeout(() => {
      updateAiBlock(id, {
        response:
          "This is a mocked AI response. AI provider integration is coming in a future milestone.",
      });
      finishAiBlock(id);
    }, 1200);
  };

  return (
    <>
      <div data-tauri-drag-region className="titlebar" />
      <BlockLog />
      <InputBar onShellCommand={handleShellCommand} onAiPrompt={handleAiPrompt} />
    </>
  );
}

type Segment =
  | { type: "output"; text: string }
  | { type: "command-start" }
  | { type: "command-done"; exitCode: number }
  | { type: "prompt" };

function parseOsc133(raw: string): Segment[] {
  const segments: Segment[] = [];
  const re = /\x1b\]133;([A-Z])(?:;([^\x07]*))?\x07/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "output", text: raw.slice(lastIndex, match.index) });
    }

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

    lastIndex = re.lastIndex;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: "output", text: raw.slice(lastIndex) });
  }

  return segments;
}

export default App;
