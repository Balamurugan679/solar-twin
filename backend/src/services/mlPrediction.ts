import axios from 'axios'

interface WeatherData {
  clouds: { all: number }
  main: { temp: number; humidity: number }
  weather: Array<{ main: string; description: string }>
}

interface PredictionResult {
  energy12h: number            // kWh (for next 12h)
  hourlyPredictions: Array<{
    time: string
    predicted: number          // kW
  }>
  weatherData: WeatherData
  timestamp: number
}

export class MLPredictionService {
  private readonly API_KEY = "2aabb707a4929ec328c31c34a79a912f"
  private readonly THINGSPEAK_API_KEY = "T9PUFQUG5G3TS85Y"
  private readonly THINGSPEAK_URL = "https://api.thingspeak.com/update"
  
  // Panel configuration
  private readonly P_STC = 0.3 // 0.3 kW = 300W panel
  private readonly EFF_DC_AC = 0.85
  private readonly LAT = 13.0083  // Chennai latitude
  private readonly LON = 80.0056  // Chennai longitude
  private readonly TZ = "Asia/Kolkata"

  async getPredictedEnergy(lat?: number, lon?: number): Promise<PredictionResult> {
    try {
      // Use provided coordinates or default to Arakkonam
      const targetLat = lat || this.LAT
      const targetLon = lon || this.LON
      
      // Get weather data
      const weatherData = await this.getWeatherData(targetLat, targetLon)
      
      // Calculate predictions using simplified model
      const predictions = this.calculatePredictions(weatherData, targetLat, targetLon)
      
      // Send to ThingSpeak
      await this.sendToThingSpeak(predictions.energy12h)
      
      return predictions
    } catch (error) {
      console.error('Error in ML prediction:', error)
      throw new Error('Failed to get ML predictions')
    }
  }

  private async getWeatherData(lat: number, lon: number): Promise<WeatherData> {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${this.API_KEY}`
      const response = await axios.get(url, { timeout: 10000 })
      return response.data
    } catch (error) {
      console.error('Error fetching weather data:', error)
      // Return default weather data if API fails
      return {
        clouds: { all: 50 },
        main: { temp: 25, humidity: 60 },
        weather: [{ main: 'Clouds', description: 'partly cloudy' }]
      }
    }
  }

  private calculatePredictions(weatherData: WeatherData, lat: number, lon: number): PredictionResult {
    const now = new Date()
    const hourlyPredictions: Array<{ time: string; predicted: number }> = []
    
    // Generate predictions for next 12 hours 
    let totalEnergy = 0
    
    for (let i = 0; i < 12; i++) {
      const futureTime = new Date(now.getTime() + i * 60 * 60 * 1000) // 1 hour intervals
      const hourOfDay = futureTime.getHours()
      
      // Simplified solar angle calculation (peak at noon)
      const sunAngle = Math.max(0, Math.sin(((hourOfDay - 6) / 12) * Math.PI))
      
      // Cloud factor calculation
      const cloudPct = weatherData.clouds.all
      const cloudFrac = Math.min(Math.max(cloudPct / 100.0, 0.0), 1.0)
      const minTrans = 0.05
      const tCloud = Math.max(1.0 - 0.75 * Math.pow(cloudFrac, 3.4), minTrans)
      
      // Temperature derating (simplified)
      const temp = weatherData.main.temp
      const tempDerate = 1 - 0.0045 * Math.max(0, temp - 25)
      
      // Calculate power
      const ghi = 1000 * sunAngle * tCloud // Simplified GHI calculation
      const pDc = this.P_STC * (ghi / 1000.0) * tempDerate
      const pAc = Math.max(0, pDc * this.EFF_DC_AC)
      
      // Add to total energy (assuming 1 hour = 1 kWh per kW)
      totalEnergy += pAc
      
      hourlyPredictions.push({
        time: futureTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        predicted: parseFloat(pAc.toFixed(3))
      })
    }

    return {
      energy12h: parseFloat(totalEnergy.toFixed(3)),
      hourlyPredictions,
      weatherData,
      timestamp: now.getTime()
    }
  }

  private async sendToThingSpeak(energy12h: number): Promise<void> {
    try {
      const payload = {
        api_key: this.THINGSPEAK_API_KEY,
        field1: energy12h.toFixed(3)
      }
      
      const response = await axios.post(this.THINGSPEAK_URL, null, {
        params: payload,
        timeout: 5000
      })
      
      if (response.status === 200) {
        console.log(`✅ Sent to ThingSpeak: ${energy12h.toFixed(3)} kWh`)
      } else {
        console.log(`⚠ Failed to send to ThingSpeak. Status: ${response.status}`)
      }
    } catch (error) {
      console.error('❌ Error sending to ThingSpeak:', error)
    }
  }

  // Get hourly predictions for chart display (already in the right format)
  getHourlyPredictions(predictions: PredictionResult): Array<{ time: string; predicted: number }> {
    return predictions.hourlyPredictions
  }
}

// Export singleton instance
export const mlPredictionService = new MLPredictionService()
