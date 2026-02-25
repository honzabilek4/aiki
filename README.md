# Aiki 合気

One terminal. Humans and AI in harmony.

Fast, open-source, local-first. Bring your own API key. No account, no cloud.

## Stack

- **App shell**: [Tauri v2](https://v2.tauri.app/) (Rust backend + web frontend)
- **Terminal rendering**: [xterm.js](https://xtermjs.org/)
- **Frontend**: React + TypeScript
- **PTY management**: Rust ([portable-pty](https://docs.rs/portable-pty))
- **AI**: BYOK — Anthropic, OpenAI-compatible, or local (Ollama)
- **Config**: TOML

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (1.77.2+)
- [Node.js](https://nodejs.org/) (20+)
- [pnpm](https://pnpm.io/)

### Run (with hot-reload)

```bash
pnpm install
pnpm tauri dev
```

Vite hot-reloads frontend changes on save. Tauri watches `src-tauri/` and recompiles Rust changes automatically.

### Build

```bash
pnpm tauri build
```

## License

MIT
