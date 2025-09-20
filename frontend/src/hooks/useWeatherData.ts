import { useState, useEffect } from 'react'

export interface WeatherData {
  temperature: number
  humidity: number
  cloudCover: number
  directRadiation: number
  diffuseRadiation: number
  globalTiltedIrradiance: number
  sunrise: string
  sunset: string
  cityName?: string
  loading: boolean
  error: string | null
}

export function useWeatherData(lat: number | null, lon: number | null) {
  const [weatherData, setWeatherData] = useState<WeatherData>({
    temperature: 0,
    humidity: 0,
    cloudCover: 0,
    directRadiation: 0,
    diffuseRadiation: 0,
    globalTiltedIrradiance: 0,
    sunrise: '',
    sunset: '',
    loading: true,
    error: null
  })

  useEffect(() => {
    if (!lat || !lon) {
      setWeatherData(prev => ({ ...prev, loading: false, error: 'No coordinates provided' }))
      return
    }

    const fetchWeatherData = async () => {
      try {
        setWeatherData(prev => ({ ...prev, loading: true, error: null }))

        // Fetch weather data from OpenWeatherMap API
        const API_KEY = "2aabb707a4929ec328c31c34a79a912f"
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
        const weatherResponse = await fetch(weatherUrl)
        const weatherData = await weatherResponse.json()

        if (!weatherResponse.ok) {
          throw new Error(weatherData.message || 'Failed to fetch weather data')
        }

        // Fetch city name using backend geocoding endpoint
        let cityName = ''
        try {
          const geoResponse = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`)
          if (geoResponse.ok) {
            const geoData = await geoResponse.json()
            cityName = geoData.cityName || ''
          }
        } catch (geoError) {
          console.warn('Geocoding failed:', geoError)
        }

        // Fallback to coordinates if geocoding fails
        if (!cityName) {
          cityName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`
        }

        const main = weatherData.main || {}
        const clouds = weatherData.clouds || {}
        const sys = weatherData.sys || {}
        const timezone = weatherData.timezone || 0
        
        // Get accurate sunrise/sunset data from dedicated endpoint
        let sunrise = ''
        let sunset = ''
        
        try {
          const sunResponse = await fetch(`/api/sunrise-sunset?lat=${lat}&lon=${lon}`)
          if (sunResponse.ok) {
            const sunData = await sunResponse.json()
            sunrise = sunData.sunrise
            sunset = sunData.sunset
          }
        } catch (sunError) {
          console.warn('Dedicated sunrise API failed, using OpenWeatherMap data:', sunError)
          
          // Fallback to OpenWeatherMap sunrise/sunset data
          if (sys.sunrise && sys.sunset) {
            const sunriseDate = new Date(sys.sunrise * 1000)
            const sunsetDate = new Date(sys.sunset * 1000)
            sunrise = sunriseDate.toISOString()
            sunset = sunsetDate.toISOString()
          }
        }
        
        // Calculate radiation estimates based on weather conditions
        const cloudCoverPercent = clouds.all || 0
        const maxRadiation = 1000 // W/m² on clear day
        const cloudFactor = 1 - (cloudCoverPercent / 100) * 0.75
        const estimatedDirectRadiation = maxRadiation * cloudFactor
        const estimatedDiffuseRadiation = maxRadiation * 0.1 * (1 + cloudCoverPercent / 100)
        const estimatedTiltedIrradiance = estimatedDirectRadiation * 0.9 + estimatedDiffuseRadiation

        setWeatherData({
          temperature: main.temp || 0,
          humidity: main.humidity || 0,
          cloudCover: cloudCoverPercent,
          directRadiation: estimatedDirectRadiation,
          diffuseRadiation: estimatedDiffuseRadiation,
          globalTiltedIrradiance: estimatedTiltedIrradiance,
          sunrise: sunrise,
          sunset: sunset,
          cityName,
          loading: false,
          error: null
        })
      } catch (error) {
        console.error('Error fetching weather data:', error)
        setWeatherData(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch weather data'
        }))
      }
    }

    fetchWeatherData()
  }, [lat, lon])

  return weatherData
}

// Utility function to format time with local timezone support
export function formatTime(timeString: string): string {
  if (!timeString) return 'N/A'
  try {
    // Handle ISO strings (full datetime)
    if (timeString.includes('T') || timeString.includes('Z')) {
      const date = new Date(timeString)
      // Return in local time zone
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata' // India Standard Time
      })
    } 
    // Handle time-only strings (HH:MM format)
    else if (timeString.includes(':')) {
      const today = new Date()
      const [hours, minutes] = timeString.split(':').map(Number)
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } else {
      return timeString
    }
  } catch (error) {
    console.warn('Error formatting time:', timeString, error)
    return timeString
  }
}
