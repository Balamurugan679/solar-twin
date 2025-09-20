import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { useWeatherData, formatTime as formatWeatherTime } from './hooks/useWeatherData'

type Weather = { temperatureC: number; humidity: number; cloudCover: number; sunlightRatio: number }
type NewsArticle = {
  title: string
  link: string
  description?: string
  content?: string
  source_id: string
  pubDate: string
}
type TelemetryMsg = {
  type: 'telemetry'
  data: {
    timestamp: number
    actualKw: number
    predictedKw: number
    weather: Weather
    ratio: number
    alert: null | { level: 'ok' | 'warning' | 'critical'; message: string; ratio: number; shouldClean: boolean }
  }
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

// Mirror backend twin: PV output = rated * irradianceFactor * tempDerate * cloudFactor * humidityDrag
function predictFromWeather(weather: Weather, ratedKw: number): number {
  const irradianceFactor = weather.sunlightRatio
  const tempCoefficientPerC = -0.0045
  const ambient = weather.temperatureC
  const deltaT = Math.max(0, ambient - 25)
  const tempDerate = 1 + tempCoefficientPerC * deltaT
  const cloudFactor = 1 - 0.75 * weather.cloudCover
  const humidityDrag = 1 - 0.05 * (weather.humidity / 100)
  const factor = Math.max(0, irradianceFactor * tempDerate * cloudFactor * humidityDrag)
  return ratedKw * factor
}

export default function App() {
  const [stream, setStream] = useState<Array<{ t: number; actual: number; predicted: number }>>(() => {
    // Generate initial historical data points for the last 24 hours at 10-minute intervals
    const now = Date.now()
    const initialData = []
    for (let i = 143; i >= 0; i--) { // 144 points = 24 hours at 10min intervals
      const timestamp = now - (i * 10 * 60 * 1000) // 10 minutes ago
      const minutes = (i * 10) / 60 // hours since start of day
      const localHour = (minutes / 10) % 24
      const sunAngle = Math.max(0, Math.sin(((localHour - 6) / 12) * Math.PI))
      const dirtLoss = 0.05 + 0.15 * Math.max(0, Math.sin(minutes / 2))
      const noise = (Math.random() - 0.5) * 0.05
      
      const idealKw = 5 * sunAngle // 5kW rated
      const actualKw = Math.max(0, idealKw * (1 - dirtLoss + noise))
      const predictedKw = idealKw
      
      initialData.push({ t: timestamp, actual: actualKw, predicted: predictedKw })
    }
    return initialData
  })
  const [latest, setLatest] = useState<TelemetryMsg['data'] | null>(null)
  const [threshold, setThreshold] = useState<number>(0.2)
  const [cleaning, setCleaning] = useState<boolean>(false)
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null)
  const [currentWx, setCurrentWx] = useState<Weather | null>(null)
  const [geoErr, setGeoErr] = useState<string | null>(null)
  const [place, setPlace] = useState<string | null>(null)
  const [predSeries, setPredSeries] = useState<Array<{ t: number; predicted: number }>>([])
  const [owmCurrent, setOwmCurrent] = useState<any | null>(null)
  const [owmAlerts, setOwmAlerts] = useState<Array<any>>([])
  const [showPredModal, setShowPredModal] = useState<boolean>(false)
  const [powerOn, setPowerOn] = useState<boolean>(true)
  const [weatherNews, setWeatherNews] = useState<NewsArticle[]>([])
  const [gemologyNews, setGemologyNews] = useState<NewsArticle[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  // Use the enhanced weather data hook
  const enhancedWeather = useWeatherData(geo?.lat || null, geo?.lon || null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => setThreshold(cfg.threshold))
  }, [])

  // News fetching functions
  const fetchNews = async (topic: string): Promise<NewsArticle[]> => {
    try {
      const apiKey = '13851dc74c8944a58e0b7209d4154320'
      const encodedTopic = encodeURIComponent(topic)
      const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodedTopic}`
      const response = await fetch(url)
      const data = await response.json()
      return data.results || []
    } catch (error) {
      console.error(`Error fetching ${topic} news:`, error)
      return []
    }
  }

  // Fetch news on component mount
  useEffect(() => {
    const loadNews = async () => {
      const [weather, gemology] = await Promise.all([
        fetchNews('weather forecast OR meteorology'),
        fetchNews('gemology OR gemstones OR diamonds')
      ])
      setWeatherNews(weather)
      setGemologyNews(gemology)
    }
    loadNews()
  }, [])

  useEffect(() => {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')
    wsRef.current = ws
    ws.onmessage = (ev) => {
      const msg: TelemetryMsg = JSON.parse(ev.data)
      if (msg.type === 'telemetry') {
        const d = msg.data
        setLatest(d)
        setStream(prev => {
          // Use user's geolocated weather prediction when available; otherwise fallback to backend
          const ratedKw = 5 // matches backend simulator ratedKw
          const localPred = currentWx ? predictFromWeather(currentWx, ratedKw) : undefined
          const predicted = localPred != null ? localPred : d.predictedKw
          const next = [...prev, { t: d.timestamp, actual: d.actualKw, predicted }]
          return next.slice(-144) // keep last 24 hours at 10min cadence (144 points = 24h)
        })
      }
    }
    return () => ws.close()
  }, [currentWx])

  // Request geolocation and fetch current weather for the user's coordinates
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoErr('Geolocation not supported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        setGeo({ lat, lon })
        fetch(`/api/weather/current?lat=${lat}&lon=${lon}`).then(r => r.json()).then(setCurrentWx).catch(() => setGeoErr('Failed to fetch weather'))
        fetch(`/api/prediction/openweather?lat=${lat}&lon=${lon}`).then(r => r.json()).then((d) => setPredSeries(d.series || [])).catch(() => {})
        fetch(`/api/openweather/current?lat=${lat}&lon=${lon}`).then(r => r.json()).then((d) => { setOwmCurrent(d.current || null); setOwmAlerts(d.alerts || []); }).catch(() => {})
        // Reverse geocode for a human-readable location name
        fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en`)
          .then(r => r.json())
          .then((g) => {
            const r = (g && g.results && g.results[0]) || null
            if (r) {
              const parts = [r.name, r.admin1, r.country].filter(Boolean)
              setPlace(parts.join(', '))
            }
          })
          .catch(() => {})
      },
      (err) => {
        setGeoErr(err.message || 'Failed to get location')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  const chartData = useMemo(() => stream.map(p => ({ time: formatTime(p.t), Actual: p.actual, Predicted: p.predicted })), [stream])
  const predictedChartData = useMemo(() => predSeries.map(p => ({ time: formatTime(p.t), Predicted: p.predicted })), [predSeries])

  async function triggerClean() {
    setCleaning(true)
    try { await fetch('/api/clean', { method: 'POST' }) } finally { setCleaning(false) }
  }

  const ratedKw = 5
  const predictedNow = latest ? (currentWx ? predictFromWeather(currentWx, ratedKw) : latest.predictedKw) : 0
  const efficiency = latest ? (latest.actualKw / Math.max(predictedNow, 0.001)) : 1
  const alertLevel = latest?.alert?.level || 'ok'

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">Solar Twin Dashboard</h1>
        <div className="flex items-center gap-3">
          {latest?.alert && latest.alert.level !== 'ok' && (
            <span className="rounded-full bg-red-600 text-white text-xs px-3 py-1">{latest.alert.level.toUpperCase()}</span>
          )}
          <button onClick={() => location.href = '/'} className="rounded-md border px-3 py-1 text-sm">Home</button>
          <div className="text-sm text-gray-500">Threshold: {(threshold * 100).toFixed(0)}%</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Card title="Actual Output (kW)">
          <BigNumber value={latest?.actualKw ?? 0} />
        </Card>
        <Card title={currentWx ? "Predicted Output (kW, your location)" : "Predicted Output (kW)"}>
          <button onClick={() => setShowPredModal(true)} className="w-full text-left">
            <BigNumber value={predictedNow} />
            <div className="mt-1 text-xs text-indigo-600">Tap for details</div>
          </button>
        </Card>
        <Card title="Efficiency">
          <div className="text-3xl font-semibold">{(efficiency * 100).toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Actual / Predicted</div>
        </Card>
        <Card title="Your Location & Solar Weather Data">
          {geoErr && <div className="text-sm text-red-600">{geoErr}</div>}
          {!geo && !geoErr && <div className="text-sm text-gray-500">Requesting location…</div>}
          {geo && (
            <div className="text-sm space-y-3">
              {/* Location Section */}
              <div>
                <div className="text-gray-500">Location</div>
                <div className="font-medium">{enhancedWeather.cityName || place || 'Locating…'}</div>
                <div className="text-xs text-gray-400">{geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}</div>
              </div>

              {/* Weather Data */}
              {enhancedWeather.loading ? (
                <div className="text-sm text-gray-500">Loading weather data…</div>
              ) : enhancedWeather.error ? (
                <div className="text-sm text-red-600">Error: {enhancedWeather.error}</div>
              ) : (
                <div className="space-y-3">
                  {/* Basic Weather */}
                  <div>
                    <div className="text-gray-500 mb-2">Current Weather</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-gray-500">Temp</span><div className="font-medium">{enhancedWeather.temperature.toFixed(1)}°C</div></div>
                      <div><span className="text-gray-500">Humidity</span><div className="font-medium">{enhancedWeather.humidity.toFixed(0)}%</div></div>
                      <div><span className="text-gray-500">Clouds</span><div className="font-medium">{enhancedWeather.cloudCover.toFixed(0)}%</div></div>
                      <div><span className="text-gray-500">Sunlight</span><div className="font-medium">{currentWx ? (currentWx.sunlightRatio * 100).toFixed(0) : 'N/A'}%</div></div>
                    </div>
                  </div>

                  {/* Solar Radiation Data */}
                  <div>
                    <div className="text-gray-500 mb-2">Solar Radiation (W/m²)</div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Direct</span>
                        <span className="font-medium">{enhancedWeather.directRadiation.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Diffuse</span>
                        <span className="font-medium">{enhancedWeather.diffuseRadiation.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="text-gray-500 font-medium">Global Tilted</span>
                        <span className="font-bold text-indigo-600">{enhancedWeather.globalTiltedIrradiance.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sunrise/Sunset */}
                  <div>
                    <div className="text-gray-500 mb-2">Sun Times</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-500">Sunrise</span>
                        <div className="font-medium text-orange-600">{formatWeatherTime(enhancedWeather.sunrise)}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Sunset</span>
                        <div className="font-medium text-orange-600">{formatWeatherTime(enhancedWeather.sunset)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card title="Real vs Predicted Energy (kW)">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={20} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Actual" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Predicted" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Alerts">
            {latest?.alert ? (
              <AlertBanner level={alertLevel} message={latest.alert.message} ratio={latest.alert.ratio} />
            ) : (
              <div className="text-sm text-gray-500">No alerts</div>
            )}
            <div className="mt-4 flex items-center gap-3">
              <button onClick={triggerClean} disabled={cleaning} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50">
                {cleaning ? 'Cleaning…' : 'Trigger Cleaning'}
              </button>
              <button onClick={() => setPowerOn(v => !v)} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-white ${powerOn ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-gray-600 hover:bg-gray-500'}`}>
                {powerOn ? 'Power: On' : 'Power: Off'}
              </button>
            </div>
          </Card>

          <Card title="OpenWeather Prediction (5 min, ±2h)">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={predictedChartData}>
                  <defs>
                    <linearGradient id="predFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={20} />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="Predicted" stroke="#22c55e" strokeWidth={2} fill="url(#predFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Local Weather News / Alerts">
            {owmAlerts.length === 0 ? (
              <div className="text-sm text-gray-500">No recent alerts</div>
            ) : (
              <ul className="text-sm list-disc pl-5 space-y-1">
                {owmAlerts.map((a, i) => (
                  <li key={i}><span className="font-medium">{a.event || 'Alert'}</span>{a.sender_name ? ` — ${a.sender_name}` : ''}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {showPredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPredModal(false)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-medium">Predicted Details</div>
              <button onClick={() => setShowPredModal(false)} className="rounded-md border px-2 py-1 text-sm">Close</button>
            </div>
            <div className="text-sm text-gray-500 mb-2">{place || 'Your location'}{owmCurrent ? ` — ${Math.round(owmCurrent.temp)}°C, ${owmCurrent.humidity}% RH, ${owmCurrent.clouds}% clouds` : ''}</div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={predictedChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={20} />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="Predicted" stroke="#22c55e" strokeWidth={2} fill="#22c55e22" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {owmAlerts.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium">Alerts</div>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {owmAlerts.slice(0, 5).map((a, i) => (
                    <li key={i}><span className="font-medium">{a.event || 'Alert'}</span>{a.sender_name ? ` — ${a.sender_name}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">{title}</div>
      {children}
    </div>
  )
}

function BigNumber({ value }: { value: number }) {
  return <div className="text-3xl font-semibold">{value.toFixed(2)}</div>
}

function AlertBanner({ level, message, ratio }: { level: 'ok' | 'warning' | 'critical'; message: string; ratio: number }) {
  const color = level === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300' : level === 'warning' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
  return (
    <div className={`rounded-md p-3 text-sm ${color}`}>
      <div className="font-medium">{message}</div>
      <div>Delta ratio: {(ratio * 100).toFixed(1)}%</div>
    </div>
  )
}


