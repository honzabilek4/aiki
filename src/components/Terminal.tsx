import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      scrollOnUserInput: true,
      scrollback: 10000,
      fontFamily: '"SF Mono", "Menlo", "Monaco", "Cascadia Code", monospace',
      fontSize: 14,
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        selectionBackground: "#3a3a5e",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;

    // Send keystrokes to PTY
    term.onData((data) => {
      invoke("pty_write", { data });
    });

    // Resize PTY when terminal resizes
    term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { cols, rows });
    });

    // Listen for PTY output
    const unlistenOutput = listen<number[]>("pty-output", (event) => {
      const bytes = new Uint8Array(event.payload);
      term.write(bytes, () => term.scrollToBottom());
    });

    // Listen for PTY exit
    const unlistenExit = listen("pty-exit", () => {
      term.writeln("\r\n[Process exited]");
    });

    // Spawn the shell
    invoke("pty_spawn", { cols: term.cols, rows: term.rows });

    // Handle window resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="terminal-container" />;
}
