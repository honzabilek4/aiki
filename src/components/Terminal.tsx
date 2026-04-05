import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig } from "../hooks/useConfig";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  config: AppConfig;
}

export default function Terminal({ config }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { appearance } = config;

    const term = new XTerm({
      cursorBlink: appearance.cursor_blink,
      scrollOnUserInput: true,
      scrollback: appearance.scrollback,
      fontFamily: appearance.font_family,
      fontSize: appearance.font_size,
      theme: {
        background: appearance.theme.background,
        foreground: appearance.theme.foreground,
        cursor: appearance.theme.cursor,
        selectionBackground: appearance.theme.selection_background,
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;

    term.onData((data) => {
      invoke("pty_write", { data });
    });

    term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { cols, rows });
    });

    const unlistenOutput = listen<number[]>("pty-output", (event) => {
      const bytes = new Uint8Array(event.payload);
      term.write(bytes, () => term.scrollToBottom());
    });

    const unlistenExit = listen("pty-exit", () => {
      term.writeln("\r\n[Process exited]");
    });

    invoke("pty_spawn", { cols: term.cols, rows: term.rows });

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
      term.dispose();
    };
  }, [config]);

  return <div ref={containerRef} className="terminal-container" />;
}
