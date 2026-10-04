# RoninTray

System tray/menubar application for [Ronin](https://github.com/roninito/ronin). A compact voice-enabled card that pops out of the tray: talk to Ronin, see the live transcription and reply with an animated waveform — plus the classic route list.

## Features

- 🎙️ Voice interface: tap the mic, talk, get a spoken + written reply
- 📝 Live transcription display with animated waveform (Web Audio)
- 🥷 Lightweight system tray integration (click tray icon to toggle the card)
- 🚀 Cross-platform (macOS, Windows, Linux)
- ⚡ Fast route discovery and updates (Routes tab)
- 🔌 Auto-connects to Ronin backend on localhost:17341
- 🎨 Dark-themed modern UI

## Voice flow

1. Click the tray icon — the card pops up like a menubar popover (hides on focus loss)
2. Tap the mic → **Listening**: mic audio is captured, waveform animates live from the mic stream, recording auto-stops after ~1.6s of silence (or tap to send, 30s max)
3. Audio is POSTed to the Ronin backend → **Thinking**
4. Backend returns transcript + reply + TTS audio → **Speaking**: reply text appears, audio plays, waveform dances

If the Ronin backend isn't running, the card shows a notice and the mic stays idle — the Routes tab keeps working off its own polling.

## Ronin backend contract

The voice card expects this endpoint on the Ronin backend (`http://localhost:17341`):

```
POST /api/voice
Content-Type: multipart/form-data
  audio: <audio/webm;codecs=opus blob>

→ 200 application/json
{
  "transcript": "what the user said",
  "reply": "what Ronin answers",
  "audio": "data:audio/wav;base64,…" | null   // TTS audio, optional
}
```

Notes for the backend implementation:
- STT: whisper.cpp / faster-whisper locally (matches Ronin's offline-first defaults)
- TTS: Piper (already used in `obsidian-piper-tts`) — return a base64 data URL or a URL the card can play
- The card fetches from the `tauri://localhost` origin, so the endpoint needs `Access-Control-Allow-Origin: *` (or equivalent)
- Suggested pipeline: STT → `ronin ask` / duty execution → Piper TTS

## Platform notes

- **macOS microphone permission**: the webview needs mic access. When packaging, make sure the app bundle's `Info.plist` includes `NSMicrophoneUsageDescription`, or macOS will deny capture silently.
- The card is draggable via its header (`data-tauri-drag-region`).

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
- **Frontend**: React + TypeScript (voice card UI, mic capture, waveform via Web Audio)
- **Voice API**: `POST http://localhost:17341/api/voice` on the Ronin backend (STT → agent → TTS)
- **Routes API**: `http://localhost:17341/api/menubar-routes`

## How It Works

1. RoninTray connects to Ronin backend via HTTP
2. Voice turns go through `POST /api/voice` (audio in → transcript + reply + TTS audio out)
3. Fetches available routes every 5 seconds (Routes tab)
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
