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

        // Fetch weather data from Open-Meteo with correct parameters
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,cloud_cover,direct_radiation,diffuse_radiation,global_tilted_irradiance&daily=sunrise,sunset&timezone=auto`
        const weatherResponse = await fetch(weatherUrl)
        const weatherData = await weatherResponse.json()

        if (!weatherResponse.ok) {
          throw new Error(weatherData.reason || 'Failed to fetch weather data')
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

        const current = weatherData.current
        const daily = weatherData.daily

        // Safely extract sunrise/sunset with fallbacks
        const sunrise = daily?.sunrise?.[0] || ''
        const sunset = daily?.sunset?.[0] || ''


        setWeatherData({
          temperature: current?.temperature_2m || 0,
          humidity: current?.relative_humidity_2m || 0,
          cloudCover: current?.cloud_cover || 0,
          directRadiation: current?.direct_radiation || 0,
          diffuseRadiation: current?.diffuse_radiation || 0,
          globalTiltedIrradiance: current?.global_tilted_irradiance || 0,
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

// Utility function to format time
export function formatTime(timeString: string): string {
  if (!timeString) return 'N/A'
  try {
    // Handle both ISO strings and time-only strings (HH:MM format)
    let date: Date
    if (timeString.includes('T') || timeString.includes('Z')) {
      // Full ISO string
      date = new Date(timeString)
    } else if (timeString.includes(':')) {
      // Time-only string (HH:MM), create date for today
      const today = new Date()
      const [hours, minutes] = timeString.split(':').map(Number)
      date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes)
    } else {
      return timeString
    }
    
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch (error) {
    console.warn('Error formatting time:', timeString, error)
    return timeString
  }
}
