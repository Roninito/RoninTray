# RoninTray

System tray/menubar application for [Ronin](https://github.com/roninito/ronin). Displays available routes from Ronin backend in your system's menu bar or system tray.

## Features

- 🥷 Lightweight system tray integration
- 🚀 Cross-platform (macOS, Windows, Linux)
- ⚡ Fast route discovery and updates
- 🔌 Auto-connects to Ronin backend on localhost:17341
- 🎨 Dark-themed modern UI

## Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Tauri CLI

### Setup

```bash
npm install
npm run dev
```

### Building

Build for your current platform:
```bash
npm run build
```

Build for specific platforms:
```bash
npm run build-mac      # macOS (universal)
npm run build-windows  # Windows
npm run build-linux    # Linux
```

## Architecture

- **Backend**: Rust + Tauri (system tray integration, HTTP client)
- **Frontend**: React + TypeScript (UI for route display)
- **API**: Connects to Ronin backend at `http://localhost:17341/api/menubar-routes`

## How It Works

1. RoninTray connects to Ronin backend via HTTP
2. Fetches available routes every 5 seconds
3. Displays routes as clickable menu items
4. Opening a route launches it in your default browser

## Installation

Install via `ronin os install`:

```bash
bun run ronin os install mac
```

## Auto-start

Once installed, RoninTray auto-starts with your system via:
- **macOS**: LaunchAgent
- **Windows**: Registry entry
- **Linux**: .desktop file in autostart

## License

MIT
