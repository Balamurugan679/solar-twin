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

        // Fetch weather data from Open-Meteo
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,cloud_cover,direct_radiation,diffuse_radiation,global_tilted_irradiance,sunrise,sunset&timezone=auto`
        const weatherResponse = await fetch(weatherUrl)
        const weatherData = await weatherResponse.json()

        if (!weatherResponse.ok) {
          throw new Error(weatherData.reason || 'Failed to fetch weather data')
        }

        // Fetch city name for reverse geocoding
        let cityName = ''
        try {
          const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en`)
          const geoData = await geoResponse.json()
          if (geoData.results && geoData.results[0]) {
            const result = geoData.results[0]
            const parts = [result.name, result.admin1, result.country].filter(Boolean)
            cityName = parts.join(', ')
          }
        } catch (geoError) {
          console.warn('Failed to fetch city name:', geoError)
        }

        const current = weatherData.current
        const daily = weatherData.daily

        setWeatherData({
          temperature: current.temperature_2m,
          humidity: current.relative_humidity_2m,
          cloudCover: current.cloud_cover,
          directRadiation: current.direct_radiation || 0,
          diffuseRadiation: current.diffuse_radiation || 0,
          globalTiltedIrradiance: current.global_tilted_irradiance || 0,
          sunrise: daily?.sunrise?.[0] || '',
          sunset: daily?.sunset?.[0] || '',
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
  if (!timeString) return ''
  try {
    const date = new Date(timeString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch (error) {
    return timeString
  }
}
