import { useState, useEffect } from 'react'

export interface ThingSpeakData {
  voltage: number
  current: number
  power: number
  irradiance: number
  panelTemperature: number
  timestamp: string
  entryId: number
}

export interface ThingSpeakHistoricalData {
  data: ThingSpeakData[]
}

export function useThingSpeakData() {
  const [latestData, setLatestData] = useState<ThingSpeakData | null>(null)
  const [historicalData, setHistoricalData] = useState<ThingSpeakData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLatestData = async () => {
    try {
      setError(null)
      const response = await fetch('/api/thingspeak/latest')
      if (!response.ok) {
        throw new Error(`Failed to fetch latest data: ${response.status}`)
      }
      const data = await response.json()
      setLatestData(data)
    } catch (err) {
      console.error('Error fetching latest ThingSpeak data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch latest data')
    }
  }

  const fetchHistoricalData = async (results: number = 10) => {
    try {
      setError(null)
      const response = await fetch(`/api/thingspeak/historical?results=${results}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.status}`)
      }
      const data: ThingSpeakHistoricalData = await response.json()
      setHistoricalData(data.data || [])
    } catch (err) {
      console.error('Error fetching historical ThingSpeak data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch historical data')
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchLatestData(),
        fetchHistoricalData(20) // Get last 20 readings
      ])
      setLoading(false)
    }

    loadData()

    // Set up polling for real-time updates every 30 seconds
    const interval = setInterval(fetchLatestData, 30000)

    return () => clearInterval(interval)
  }, [])

  return {
    latestData,
    historicalData,
    loading,
    error,
    refetch: fetchLatestData,
    refetchHistorical: fetchHistoricalData
  }
}

// Utility function to format sensor values
export function formatSensorValue(value: number, unit: string, decimals: number = 2): string {
  if (isNaN(value) || value === null || value === undefined) {
    return 'N/A'
  }
  return `${value.toFixed(decimals)} ${unit}`
}

// Utility function to get sensor status based on values
export function getSensorStatus(data: ThingSpeakData | null) {
  if (!data) return { status: 'offline', message: 'No data available' }

  const { voltage, current, power, irradiance, panelTemperature } = data

  // Check for reasonable solar panel values
  if (voltage > 0 && current > 0 && power > 0) {
    return { status: 'active', message: 'Solar panel generating power' }
  } else if (voltage > 0 && current === 0) {
    return { status: 'standby', message: 'Panel connected but no current flow' }
  } else if (voltage === 0) {
    return { status: 'offline', message: 'Panel disconnected or no sunlight' }
  } else {
    return { status: 'unknown', message: 'Sensor data unclear' }
  }
}
