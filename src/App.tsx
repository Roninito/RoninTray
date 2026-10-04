import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { appWindow } from '@tauri-apps/api/window'
import './App.css'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'
type Tab = 'talk' | 'routes'

interface Route {
  path: string
  title?: string
}

interface VoiceResult {
  transcript: string
  reply: string
  /** base64 data URL (e.g. data:audio/wav;base64,...) or remote URL, optional */
  audio?: string | null
}

const VOICE_URL = 'http://localhost:17341/api/voice'
const BACKEND_URL = 'http://localhost:17341'
const SILENCE_MS = 1600
const MIN_LISTEN_MS = 1200
const MAX_LISTEN_MS = 30000
const BAR_COUNT = 52

const STATUS: Record<Phase, string> = {
  idle: 'Tap the mic and talk to Ronin',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Ronin is speaking',
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function App() {
  const [tab, setTab] = useState<Tab>('talk')
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [routesOnline, setRoutesOnline] = useState(false)

  const phaseRef = useRef<Phase>('idle')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const listenStartRef = useRef(0)
  const lastSoundRef = useRef(0)
  const replyAudioRef = useRef<HTMLAudioElement | null>(null)
  const reqIdRef = useRef(0)
  const stopListeningRef = useRef<() => void>(() => {})

  phaseRef.current = phase

  // ---- routes (existing behavior, kept) ----
  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const result = await invoke<Route[]>('fetch_routes')
        setRoutes(result)
        setRoutesOnline(true)
      } catch {
        setRoutesOnline(false)
      }
    }
    fetchRoutes()
    const interval = setInterval(fetchRoutes, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRouteClick = async (path: string) => {
    try {
      await invoke('open_url', { url: `${BACKEND_URL}${path}` })
    } catch (err) {
      console.error('Failed to open route:', err)
    }
  }

  // ---- mic plumbing ----
  const cleanupMic = () => {
    analyserRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }

  const sendVoice = async (blob: Blob, reqId: number) => {
    setPhase('thinking')
    try {
      const form = new FormData()
      form.append('audio', blob, 'input.webm')
      const res = await fetch(VOICE_URL, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Ronin replied ${res.status}`)
      const data = (await res.json()) as VoiceResult
      if (reqIdRef.current !== reqId) return // superseded
      setTranscript(data.transcript || '')
      setReply(data.reply || '')
      setNotice(null)
      if (data.audio) {
        const audio = new Audio(data.audio)
        replyAudioRef.current = audio
        setPhase('speaking')
        audio.onended = () => {
          if (reqIdRef.current === reqId) setPhase('idle')
        }
        audio.onerror = () => {
          if (reqIdRef.current === reqId) setPhase('idle')
        }
        await audio.play()
      } else {
        setPhase('idle')
      }
    } catch {
      if (reqIdRef.current !== reqId) return
      setNotice('Couldn’t reach Ronin voice — is the backend running on :17341?')
      setPhase('idle')
    }
  }

  const stopListening = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupMic()
      setPhase('idle')
      return
    }
    const reqId = reqIdRef.current
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      })
      chunksRef.current = []
      cleanupMic()
      if (blob.size > 0) {
        void sendVoice(blob, reqId)
      } else {
        setPhase('idle')
      }
    }
    recorder.stop()
  }

  useEffect(() => {
    stopListeningRef.current = stopListening
  })

  const startListening = async () => {
    if (phaseRef.current !== 'idle') return
    reqIdRef.current += 1
    replyAudioRef.current?.pause()
    replyAudioRef.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      const audioCtx = new AC()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      streamRef.current = stream
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      recorderRef.current = recorder
      listenStartRef.current = performance.now()
      lastSoundRef.current = performance.now()
      setTranscript('')
      setReply('')
      setNotice(null)
      setPhase('listening')
      recorder.start()
    } catch {
      setNotice('Microphone unavailable — check OS / browser permission.')
    }
  }

  const handleMicClick = () => {
    const p = phaseRef.current
    if (p === 'idle') void startListening()
    else if (p === 'listening') stopListening()
    else {
      // thinking / speaking → cancel
      reqIdRef.current += 1
      replyAudioRef.current?.pause()
      replyAudioRef.current = null
      cleanupMic()
      setPhase('idle')
    }
  }

  // ---- waveform + silence detection loop ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const levels = new Array<number>(BAR_COUNT).fill(0.06)
    const freq = new Uint8Array(512)
    const time = new Uint8Array(2048)
    let raf = 0

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const phase = phaseRef.current
      const analyser = analyserRef.current

      if (phase === 'listening' && analyser) {
        analyser.getByteTimeDomainData(time)
        let sum = 0
        for (let i = 0; i < time.length; i += 4) {
          const v = (time[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / (time.length / 4))
        const now = performance.now()
        if (rms > 0.02) {
          lastSoundRef.current = now
        } else if (
          now - lastSoundRef.current > SILENCE_MS &&
          now - listenStartRef.current > MIN_LISTEN_MS
        ) {
          stopListeningRef.current()
          return
        }
        if (now - listenStartRef.current > MAX_LISTEN_MS) {
          stopListeningRef.current()
          return
        }
      }

      const targets = new Array<number>(BAR_COUNT)
      if (phase === 'listening' && analyser) {
        analyser.getByteFrequencyData(freq)
        const bins = analyser.frequencyBinCount
        for (let i = 0; i < BAR_COUNT; i++) {
          const bin = Math.min(
            bins - 1,
            2 + Math.floor(Math.pow(i / BAR_COUNT, 1.5) * bins * 0.65),
          )
          targets[i] = Math.max(0.06, freq[bin] / 255)
        }
      } else if (phase === 'speaking') {
        for (let i = 0; i < BAR_COUNT; i++) {
          targets[i] =
            0.25 +
            0.55 *
              Math.abs(Math.sin(t / 300 + i * 0.45)) *
              Math.abs(Math.sin(t / 733 + i * 0.2))
        }
      } else if (phase === 'thinking') {
        for (let i = 0; i < BAR_COUNT; i++) {
          targets[i] = 0.12 + 0.25 * Math.abs(Math.sin(t / 500 + i * 0.3))
        }
      } else {
        for (let i = 0; i < BAR_COUNT; i++) {
          targets[i] = 0.08 + 0.05 * Math.sin(t / 900 + i * 0.35)
        }
      }
      for (let i = 0; i < BAR_COUNT; i++) {
        levels[i] += (targets[i] - levels[i]) * 0.35
      }

      ctx.clearRect(0, 0, W, H)
      const gap = 4
      const bw = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT
      const grad = ctx.createLinearGradient(0, 0, W, 0)
      grad.addColorStop(0, '#22d3ee')
      grad.addColorStop(0.5, '#818cf8')
      grad.addColorStop(1, '#c084fc')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(129,140,248,0.7)'
      ctx.shadowBlur = 10
      const mid = H / 2
      for (let i = 0; i < BAR_COUNT; i++) {
        const h = Math.max(3, levels[i] * (H - 16))
        roundRect(ctx, i * (bw + gap), mid - h / 2, bw, h, bw / 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    return () => {
      cleanupMic()
      replyAudioRef.current?.pause()
    }
  }, [])

  return (
    <div className="card">
      <header className="card-header" data-tauri-drag-region>
        <span className="logo">🥷 Ronin</span>
        <nav className="tabs">
          <button
            className={tab === 'talk' ? 'active' : ''}
            onClick={() => setTab('talk')}
          >
            Talk
          </button>
          <button
            className={tab === 'routes' ? 'active' : ''}
            onClick={() => setTab('routes')}
          >
            Routes
          </button>
        </nav>
        <button
          className="icon-btn"
          onClick={() => void appWindow.hide()}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      {tab === 'talk' ? (
        <main className="talk">
          <div className="status-line">
            <span className={`dot ${phase}`} />
            {STATUS[phase]}
          </div>

          <div className="exchange">
            {!transcript && !reply && phase === 'idle' && (
              <p className="hint">Ask about your duties, routes, anything…</p>
            )}
            {transcript && <p className="user-line">“{transcript}”</p>}
            {reply && (
              <p className="ronin-line">
                <span className="eyebrow">Ronin</span>
                {reply}
              </p>
            )}
            {phase === 'thinking' && !reply && (
              <p className="hint">Working on it…</p>
            )}
          </div>

          <canvas ref={canvasRef} className="wave" />

          <div className="controls">
            <button
              className={`mic ${phase}`}
              onClick={handleMicClick}
              aria-label={
                phase === 'idle'
                  ? 'Start talking'
                  : phase === 'listening'
                    ? 'Stop and send'
                    : 'Cancel'
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="26"
                height="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="17" x2="12" y2="22" />
              </svg>
            </button>
            <span className="mic-label">
              {phase === 'idle'
                ? 'Tap to talk'
                : phase === 'listening'
                  ? 'Tap to send'
                  : 'Tap to cancel'}
            </span>
          </div>

          {notice && <p className="notice">{notice}</p>}
        </main>
      ) : (
        <main className="routes-pane">
          <div className="routes-head">
            <span>Routes</span>
            <span className={`pill ${routesOnline ? 'on' : 'off'}`}>
              {routesOnline ? '● Live' : '● Offline'}
            </span>
          </div>
          {routes.length > 0 ? (
            <div className="routes">
              {routes.map((route) => (
                <button
                  key={route.path}
                  className="route-item"
                  onClick={() => void handleRouteClick(route.path)}
                >
                  <span className="route-title">
                    {route.title || route.path}
                  </span>
                  <span className="route-path">{route.path}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">No routes — start the Ronin backend.</p>
          )}
        </main>
      )}
    </div>
  )
}

export default App
