# Aiki 合気

Harmonized energy. A fast, open-source terminal built for the agentic era.

AI is a first-class citizen, not an add-on. Bring your own API key. Runs entirely local. No account, no cloud.

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

### Run

```bash
pnpm install
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## License

MIT
