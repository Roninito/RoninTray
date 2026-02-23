import { useEffect, useState } from 'react'
import './App.css'

interface Route {
  path: string
  title?: string
}

function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const result = await invoke<Route[]>('fetch_routes')
        setRoutes(result)
        setError(null)
        setConnected(true)
      } catch (err) {
        setError(String(err))
        setConnected(false)
      } finally {
        setLoading(false)
      }
    }

    fetchRoutes()
    const interval = setInterval(fetchRoutes, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRouteClick = async (path: string) => {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const fullUrl = `http://localhost:17341${path}`
    try {
      await invoke('open_url', { url: fullUrl })
    } catch (err) {
      console.error('Failed to open route:', err)
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🥷 Ronin Routes</h1>
        <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '● Offline'}
        </div>
      </div>

      {loading && <div className="loading">Loading routes...</div>}

      {error && !loading && (
        <div className="error">
          <p>Unable to fetch routes from Ronin</p>
          <small>{error}</small>
        </div>
      )}

      {!loading && routes.length > 0 && (
        <div className="routes">
          {routes.map((route) => (
            <button
              key={route.path}
              className="route-item"
              onClick={() => handleRouteClick(route.path)}
            >
              <span className="route-title">{route.title || route.path}</span>
              <span className="route-path">{route.path}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && routes.length === 0 && !error && (
        <div className="empty">No routes available</div>
      )}

      <div className="footer">
        <small>RoninTray v0.1.0</small>
      </div>
    </div>
  )
}

export default App
