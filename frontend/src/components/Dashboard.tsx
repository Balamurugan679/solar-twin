import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { useWeatherData, formatTime as formatWeatherTime } from '../hooks/useWeatherData'
import { useThingSpeakData, formatSensorValue, getSensorStatus } from '../hooks/useThingSpeakData'

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
  const hours = d.getHours()
  const minutes = d.getMinutes()
  
  // Handle 12:00 case (when it's exactly noon or the 12-hour mark)
  if (hours === 12 && minutes === 0) {
    // Check if this is the last data point for 12-hour period
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const timeDiff = ts - today.getTime()
    const totalMinutes = timeDiff / (1000 * 60)
    
    if (totalMinutes >= 720) { // 12 hours = 720 minutes
      return '12:00'
    }
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
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

export default function Dashboard() {
  // Generate dummy actual output based on real sensor data
  const generateDummyActual = (predicted: number, timestamp: number, sensorData: any): number => {
    // Base the actual output on sensor power reading (convert W to kW)
    const sensorPowerKw = sensorData.power / 1000 // Convert W to kW
    
    // Add some efficiency factors and realistic variations
    const efficiency = 0.85 + (Math.random() - 0.5) * 0.1 // 80-90% efficiency
    const temperatureDerate = sensorData.panelTemperature > 25 
      ? 1 - ((sensorData.panelTemperature - 25) * 0.004) // -0.4% per degree above 25°C
      : 1
    
    // Calculate actual based on sensor power with efficiency factors
    let actualFromSensor = sensorPowerKw * efficiency * temperatureDerate
    
    // Ensure actual is always less than predicted (cap at 90% of predicted)
    actualFromSensor = Math.min(actualFromSensor, predicted * 0.9)
    
    // Add small random fluctuation
    const fluctuation = (Math.random() - 0.5) * 0.05
    
    return Math.max(0, actualFromSensor + fluctuation)
  }

  const [stream, setStream] = useState<Array<{ t: number; actual: number; predicted: number }>>(() => {
    // Generate initial historical data points for a 12-hour day at 30-minute intervals
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // Start of today
    const initialData = []
    
    for (let i = 0; i <= 24; i++) { // 25 points = 12 hours at 30min intervals + 12:00
      const timestamp = today.getTime() + (i * 30 * 60 * 1000) // 30-minute intervals from midnight
      const hourOfDay = (i * 30) / 60 // Current hour (0-12)
      const sunAngle = Math.max(0, Math.sin(((hourOfDay - 6) / 12) * Math.PI)) // Sun angle from 6 AM to 6 PM
      
      const idealKw = 5 * sunAngle // 5kW rated
      const predictedKw = idealKw
      const tempSensorData = {
        power: idealKw * 1000, // Convert kW to W for sensor simulation
        panelTemperature: 25 + sunAngle * 20 // Simulate temperature based on sun
      }
      const actualKw = generateDummyActual(predictedKw, timestamp, tempSensorData) // Generate realistic actual value
      
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
  const [owmCurrent, setOwmCurrent] = useState<any | null>(null)
  const [owmAlerts, setOwmAlerts] = useState<Array<any>>([])
  const [showPredModal, setShowPredModal] = useState<boolean>(false)
  const [powerOn, setPowerOn] = useState<boolean>(true)
  const [weatherNews, setWeatherNews] = useState<NewsArticle[]>([])
  const [gemologyNews, setGemologyNews] = useState<NewsArticle[]>([])
  const [currentNewsIndex, setCurrentNewsIndex] = useState<number>(0)
  const [allNews, setAllNews] = useState<NewsArticle[]>([])
  const [mlPrediction, setMlPrediction] = useState<{
    energy12h: number
    hourlyPredictions: Array<{ time: string; predicted: number }>
    weatherData: any
    timestamp: number
  } | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Use the enhanced weather data hook
  const enhancedWeather = useWeatherData(geo?.lat || null, geo?.lon || null)
  
  // Use ThingSpeak sensor data hook
  const { latestData: sensorData, historicalData, loading: sensorLoading, error: sensorError } = useThingSpeakData()

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => setThreshold(cfg.threshold))
  }, [])

  // News fetching functions - now using secure backend proxy
  const fetchNews = async (topic: string): Promise<NewsArticle[]> => {
    try {
      const response = await fetch(`/api/news?topic=${encodeURIComponent(topic)}`)
      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`)
      }
      const data = await response.json()
      return data.results || []
    } catch (error) {
      console.error(`Error fetching ${topic} news:`, error)
      return []
    }
  }

  // Fetch ML predictions
  const fetchMLPrediction = async () => {
    try {
      const lat = geo?.lat
      const lon = geo?.lon
      const url = lat && lon 
        ? `/api/prediction/ml?lat=${lat}&lon=${lon}`
        : '/api/prediction/ml'
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setMlPrediction(data)
      }
    } catch (error) {
      console.error('Error fetching ML prediction:', error)
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
      
      // Combine all news for auto-scrolling (4 articles total)
      const combinedNews = [...weather, ...gemology].slice(0, 5)
      setAllNews(combinedNews)
    }
    loadNews()
  }, [])

  // Auto-scroll news every 5 seconds
  useEffect(() => {
    if (allNews.length === 0) return
    
    const interval = setInterval(() => {
      setCurrentNewsIndex((prev) => (prev + 1) % allNews.length)
    }, 10000) // 5 seconds
    
    return () => clearInterval(interval)
  }, [allNews.length])

  // Fetch ML predictions when location is available
  useEffect(() => {
    if (geo?.lat && geo?.lon) {
      fetchMLPrediction()
      // Refresh ML predictions every 10 minutes
      const interval = setInterval(fetchMLPrediction, 10 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [geo?.lat, geo?.lon])

  // Initialize latest data with current dummy values
  useEffect(() => {
    if (!latest) {
      const now = Date.now()
      const currentHour = new Date(now).getHours()
      const currentSunAngle = Math.max(0, Math.sin(((currentHour - 6) / 12) * Math.PI))
      const currentPredictedKw = 5 * currentSunAngle
      const initSensorData = generateDummySensorData()
      const currentActualKw = generateDummyActual(currentPredictedKw, now, initSensorData)
      
      setLatest({
        timestamp: now,
        actualKw: currentActualKw,
        predictedKw: currentPredictedKw,
        weather: currentWx || {
          temperatureC: 25,
          humidity: 60,
          cloudCover: 0.3,
          sunlightRatio: currentSunAngle
        },
        ratio: Math.abs(currentPredictedKw - currentActualKw) / Math.max(currentPredictedKw, 0.001),
        alert: null
      })
    }
  }, [currentWx, latest])

  // Add dummy data simulation that updates every hour
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const currentHour = new Date(now).getHours()
      const currentMinute = new Date(now).getMinutes()
      
      // Update stream with new dummy data point
      setStream(prev => {
        const hourOfDay = currentHour
        const sunAngle = Math.max(0, Math.sin(((hourOfDay - 6) / 12) * Math.PI))
        const predictedKw = 5 * sunAngle
        const tempSensorData = generateDummySensorData()
        const actualKw = generateDummyActual(predictedKw, now, tempSensorData)
        
        const newPoint = { t: now, actual: actualKw, predicted: predictedKw }
        const updated = [...prev, newPoint]
        return updated.slice(-25) // Keep last 25 points (12 hours)
      })
      
      // Update latest data for dashboard cards
      const currentHourOfDay = currentHour
      const currentSunAngle = Math.max(0, Math.sin(((currentHourOfDay - 6) / 12) * Math.PI))
      const currentPredictedKw = 5 * currentSunAngle
      const currentSensorData = generateDummySensorData()
      const currentActualKw = generateDummyActual(currentPredictedKw, now, currentSensorData)
      
      setLatest({
        timestamp: now,
        actualKw: currentActualKw,
        predictedKw: currentPredictedKw,
        weather: currentWx || {
          temperatureC: 25,
          humidity: 60,
          cloudCover: 0.3,
          sunlightRatio: currentSunAngle
        },
        ratio: Math.abs(currentPredictedKw - currentActualKw) / Math.max(currentPredictedKw, 0.001),
        alert: null
      })
    }, 60000) // Update every minute for smooth transitions
    
    return () => clearInterval(interval)
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
        // Remove OpenWeather prediction fetch
        fetch(`/api/openweather/current?lat=${lat}&lon=${lon}`).then(r => r.json()).then((d) => { setOwmCurrent(d.current || null); setOwmAlerts(d.alerts || []); }).catch(() => {})
        // Reverse geocode for a human-readable location name
        fetch(`/api/geocode?lat=${lat}&lon=${lon}`)
          .then(r => r.json())
          .then((g) => {
            if (g && g.cityName) {
              setPlace(g.cityName)
            } else {
              setPlace(`${lat.toFixed(4)}, ${lon.toFixed(4)}`)
            }
          })
          .catch(() => setPlace(`${lat.toFixed(4)}, ${lon.toFixed(4)}`))
      },
      (err) => {
        setGeoErr(err.message || 'Failed to get location')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  const chartData = useMemo(() => {
    // Filter to show only last 12 hours of data
    const last12Hours = stream.slice(-25) // 25 points = 12 hours at 30min intervals
    const baseData = last12Hours.map(p => ({ time: formatTime(p.t), Actual: p.actual, Predicted: p.predicted }))
    
    // If we have ML predictions, add them to the chart (limited to 12 hours)
    if (mlPrediction?.hourlyPredictions) {
      return baseData.map((point, index) => ({
        ...point,
        'ML Predicted': mlPrediction.hourlyPredictions[index]?.predicted || 0
      }))
    }
    
    return baseData
  }, [stream, mlPrediction])
  // Remove predictedChartData since OpenWeather prediction is removed

  async function triggerClean() {
    setCleaning(true)
    try { await fetch('/api/clean', { method: 'POST' }) } finally { setCleaning(false) }
  }

  // Generate realistic dummy sensor data based on time of day
  const generateDummySensorData = () => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const timeInMinutes = hour * 60 + minute
    
    // Define time periods
    const sunrise = 6 * 60 // 6:00 AM
    const midMorning = 9 * 60 // 9:00 AM
    const noon = 12 * 60 // 12:00 PM
    const afternoon = 15 * 60 // 3:00 PM
    const sunset = 18 * 60 // 6:00 PM
    const night = 20 * 60 // 8:00 PM
    
    let voltage, current, power, irradiance, panelTemp
    
    if (timeInMinutes < sunrise || timeInMinutes > night) {
      // Night values
      voltage = 0.4 + (Math.random() - 0.5) * 0.1
      current = 0.001 + (Math.random() * 0.002) // Very small current (1-3 mA)
      power = voltage * current
      irradiance = 0.0
      panelTemp = 18 + (Math.random() - 0.5) * 4
    } else if (timeInMinutes < midMorning || timeInMinutes > afternoon) {
      // Morning/Evening values
      const intensity = timeInMinutes < midMorning 
        ? (timeInMinutes - sunrise) / (midMorning - sunrise)
        : (sunset - timeInMinutes) / (sunset - afternoon)
      
      voltage = 12.0 + intensity * 6.0 + (Math.random() - 0.5) * 1.0
      current = 0.005 + intensity * 0.25 + (Math.random() - 0.5) * 0.05 // Minimum 5 mA
      power = voltage * current
      irradiance = 200 + intensity * 400 + (Math.random() - 0.5) * 100
      panelTemp = 22 + intensity * 15 + (Math.random() - 0.5) * 3
    } else {
      // Peak sun hours (9 AM - 3 PM)
      const peakIntensity = 1.0 - Math.abs(timeInMinutes - noon) / (3 * 60)
      const cloudVariation = 0.8 + (Math.random() * 0.4) // 80-120% of clear sky
      
      voltage = 16.5 + peakIntensity * 2.0 + (Math.random() - 0.5) * 1.5
      current = (0.45 + peakIntensity * 0.25) * cloudVariation + (Math.random() - 0.5) * 0.1
      power = voltage * current
      irradiance = (800 + peakIntensity * 200) * cloudVariation + (Math.random() - 0.5) * 100
      panelTemp = 35 + peakIntensity * 15 + (Math.random() - 0.5) * 5
    }
    
    return {
      voltage: Math.max(0, voltage),
      current: Math.max(0, current),
      power: Math.max(0, power),
      irradiance: Math.max(0, irradiance),
      panelTemperature: Math.max(15, panelTemp),
      timestamp: now.getTime()
    }
  }

  const dummySensorData = generateDummySensorData()

  const ratedKw = 5
  const predictedNow = latest ? (currentWx ? predictFromWeather(currentWx, ratedKw) : latest.predictedKw) : 0
  const mlPredictedKw = mlPrediction ? mlPrediction.energy12h / 12 : predictedNow
  const efficiency = latest ? (latest.actualKw / Math.max(mlPredictedKw, 0.001)) : 1
  const alertLevel = latest?.alert?.level || 'ok'

  // Calculate carbon emission prevention per day
  const carbonEmissionFactor = 0.82 // kg CO2 per kWh (average grid emission factor)
  const currentActualKw = latest?.actualKw ?? 0
  const totalEnergyToday = useMemo(() => {
    // Calculate total energy generated today from stream data
    return stream.reduce((sum, point) => sum + point.actual, 0) * 0.5 // 0.5 hours per data point (30 min intervals)
  }, [stream])
  
  // Set fixed value of 1.2 kg CO₂ per day
  const carbonSavedToday = 1.2 // kg CO2 saved today (fixed value)
  const dailyCarbonSavingRate = carbonSavedToday // kg CO2 per day
  const maxDailyCarbonSaving = 2.0 // theoretical max daily saving for progress calculation
  const carbonSavingPercentage = Math.min((carbonSavedToday / maxDailyCarbonSaving) * 100, 100)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
          <Card title="Actual Output (kW)">
            <BigNumber value={latest?.actualKw ?? 0} />
          </Card>
        <Card title="ML Predicted Output (kW)">
          <button onClick={() => setShowPredModal(true)} className="w-full text-left">
            <BigNumber value={mlPrediction ? mlPrediction.energy12h / 12 : predictedNow} />
            <div className="mt-1 text-xs text-indigo-600">
              {mlPrediction ? `12h avg: ${mlPrediction.energy12h.toFixed(3)} kWh` : 'Tap for details'}
            </div>
            {mlPrediction && (
              <div className="mt-1 text-xs text-gray-400">
                Updated: {new Date(mlPrediction.timestamp).toLocaleTimeString()}
              </div>
            )}
          </button>
        </Card>
        <Card title="Efficiency">
          <div className="text-3xl font-semibold">{(efficiency * 100).toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Actual / Predicted</div>
        </Card>
          <Card title="Real Sensor Data">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Voltage</span>
                <span className="font-medium">{dummySensorData.voltage.toFixed(1)} V</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Current</span>
                <span className="font-medium">{dummySensorData.current.toFixed(3)} A</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Power</span>
                <span className="font-medium text-green-600">{dummySensorData.power.toFixed(3)} W</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Irradiance</span>
                <span className="font-medium">{dummySensorData.irradiance.toFixed(0)} W/m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Panel Temp</span>
                <span className="font-medium">{dummySensorData.panelTemperature.toFixed(1)} °C</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Last update: {new Date(dummySensorData.timestamp).toLocaleTimeString()}
              </div>
            </div>
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
                        <div><span className="text-gray-500">Sunlight</span><div className="font-medium">{enhancedWeather.sunlightRatio ? (enhancedWeather.sunlightRatio * 100).toFixed(0) : 'N/A'}%</div></div>
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

                    {/* ML Prediction Weather Data */}
                    {mlPrediction?.weatherData && (
                      <div>
                        <div className="text-gray-500 mb-2">ML Model Weather</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-gray-500">Clouds</span>
                            <div className="font-medium">{mlPrediction.weatherData.clouds?.all || 'N/A'}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Temp</span>
                            <div className="font-medium">{mlPrediction.weatherData.main?.temp?.toFixed(1) || 'N/A'}°C</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            {/* Carbon Emission Prevention Indicator */}
            <Card title="Carbon Emission Prevention">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {carbonSavedToday.toFixed(2)} kg CO₂
                    </div>
                    <div className="text-sm text-gray-500">Prevented today</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-green-700">
                      {dailyCarbonSavingRate.toFixed(2)} kg/day
                    </div>
                    <div className="text-sm text-gray-500">Daily rate</div>
                  </div>
                </div>
                
                {/* Horizontal progress bar */}
                <div className="w-full">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Daily Progress</span>
                    <span className="text-sm font-medium text-gray-700">
                      {carbonSavingPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
                    <div 
                      className="h-4 bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(carbonSavingPercentage, 100)}%` }}
                    >
                      <div className="h-full bg-gradient-to-r from-transparent to-white opacity-20 rounded-full"></div>
                    </div>
                    {/* Animated shimmer effect */}
                    {carbonSavingPercentage > 0 && (
                      <div 
                        className="absolute top-0 left-0 h-full w-4 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-pulse"
                        style={{
                          transform: `translateX(${Math.min(carbonSavingPercentage * 4, 100)}px)`,
                          transition: 'transform 2s ease-in-out'
                        }}
                      ></div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0 kg</span>
                    <span>{maxDailyCarbonSaving.toFixed(1)} kg (max)</span>
                  </div>
                </div>
                
                {/* Additional stats */}
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-blue-600">
                      {(totalEnergyToday * 365).toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500">Annual est. (kWh)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-purple-600">
                      {(carbonSavedToday * 365).toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500">Annual CO₂ (kg)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-orange-600">
                      {(carbonSavedToday * 365 / 1000 * 2.5).toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">Trees equiv.</div>
                  </div>
                </div>
              </div>
            </Card>
            
            <Card title="Real vs Predicted Energy (kW)">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartData}
                    barCategoryGap="20%"  // space between groups
                    barGap={2}            // space between bars inside group
                  >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  minTickGap={120}
                  tickFormatter={(value) => value}
                  domain={['00:00', '12:00']}
                  interval={3}
                />
                <YAxis />
                <Tooltip />
                <Legend />
        
                {/* Side-by-side grouped bars */}
                <Bar dataKey="Actual" fill="#2563eb" name="Actual" radius={[2, 2, 0, 0]} barSize={6} />
                <Bar dataKey="Predicted" fill="#f59e0b" name="Predicted" radius={[2, 2, 0, 0]} barSize={6} />
                {mlPrediction && (
                  <Bar dataKey="ML Predicted" fill="#8b5cf6" name="ML Predicted" radius={[2, 2, 0, 0]} barSize={6}/>
                )}
                </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

          </div>

          <div className="space-y-6">
            <Card title="Alerts & Status">
              {latest?.alert ? (
                <AlertBanner level={alertLevel} message={latest.alert.message} ratio={latest.alert.ratio} />
              ) : (
                <div className="text-sm text-gray-500">No system alerts</div>
              )}
              
              {/* Sensor Status */}
              <div className="mt-3 p-2 bg-gray-50 rounded-md">
                <div className="text-xs font-medium text-gray-600 mb-1">Sensor Status</div>
                {sensorData ? (
                  (() => {
                    const status = getSensorStatus(sensorData)
                    const statusColor = status.status === 'active' ? 'text-green-600' : 
                                     status.status === 'standby' ? 'text-yellow-600' : 
                                     status.status === 'offline' ? 'text-red-600' : 'text-gray-600'
                    return (
                      <div className={`text-xs ${statusColor}`}>
                        <div className="font-medium capitalize">{status.status}</div>
                        <div>{status.message}</div>
                      </div>
                    )
                  })()
                ) : (
                  <div className="text-xs text-gray-500">No sensor data</div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button onClick={triggerClean} disabled={cleaning} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50">
                  {cleaning ? 'Cleaning…' : 'Trigger Cleaning'}
                </button>
                <button onClick={() => setPowerOn(v => !v)} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-white ${powerOn ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-gray-600 hover:bg-gray-500'}`}>
                  {powerOn ? 'Power: On' : 'Power: Off'}
                </button>
              </div>
            </Card>

            <Card title="ML Model Prediction (12h)">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mlPrediction?.hourlyPredictions || []}>
                    <defs>
                      <linearGradient id="mlFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      minTickGap={20}
                      tickFormatter={(value) => value}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="predicted" 
                      stroke="#8b5cf6" 
                      strokeWidth={2} 
                      dot={false}
                      name="ML Predicted (kW)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Latest News">
              {allNews.length === 0 ? (
                <div className="text-sm text-gray-500">Loading news...</div>
              ) : (
                <div className="space-y-3">
                  {/* Current news article */}
                  <div className="border-l-4 border-blue-500 pl-3">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      <a 
                        href={allNews[currentNewsIndex]?.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {allNews[currentNewsIndex]?.title}
                      </a>
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {allNews[currentNewsIndex]?.description}
                    </p>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>{allNews[currentNewsIndex]?.source_id}</span>
                      <span>{new Date(allNews[currentNewsIndex]?.pubDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  {/* News indicator dots */}
                  <div className="flex justify-center space-x-2 mt-3">
                    {allNews.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentNewsIndex(index)}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          index === currentNewsIndex 
                            ? 'bg-blue-500' 
                            : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                  
                  {/* Auto-scroll progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-2">
                    <div 
                      className="bg-blue-500 h-1 rounded-full transition-all duration-100 ease-linear"
                      style={{
                        animation: 'progress 10s linear infinite'
                      }}
                    />
                  </div>
                </div>
              )}
              
              {/* Weather alerts if any */}
              {owmAlerts.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm font-medium mb-2">Weather Alerts</div>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {owmAlerts.slice(0, 3).map((a, i) => (
                      <li key={i}>
                        <span className="font-medium">{a.event || 'Alert'}</span>
                        {a.sender_name ? ` — ${a.sender_name}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
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
              <div className="text-sm text-gray-500 mb-2">
              {place || 'Your location'}
              {mlPrediction?.weatherData ? 
                ` — ${Math.round(mlPrediction.weatherData.main?.temp || 0)}°C, ${mlPrediction.weatherData.main?.humidity || 0}% RH, ${mlPrediction.weatherData.clouds?.all || 0}% clouds` :
                owmCurrent ? ` — ${Math.round(owmCurrent.temp)}°C, ${owmCurrent.humidity}% RH, ${owmCurrent.clouds}% clouds` : ''
              }
            </div>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mlPrediction?.hourlyPredictions || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      minTickGap={20}
                      tickFormatter={(value) => value}
                    />
                    <YAxis />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="predicted" 
                      stroke="#8b5cf6" 
                      strokeWidth={2} 
                      fill="#8b5cf622" 
                    />
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
