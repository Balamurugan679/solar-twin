import axios from 'axios'

interface WeatherData {
  clouds: { all: number }
  main: { temp: number; humidity: number }
  weather: Array<{ main: string; description: string }>
}

interface PredictionResult {
  energy12h: number
  hourlyPredictions: Array<{
    timestamp: number
    power: number
    energy: number
  }>
  weatherData: WeatherData
}

export class MLPredictionService {
  private readonly API_KEY = "2aabb707a4929ec328c31c34a79a912f"
  private readonly THINGSPEAK_API_KEY = "T9PUFQUG5G3TS85Y"
  private readonly THINGSPEAK_URL = "https://api.thingspeak.com/update"
  
  // Panel configuration
  private readonly P_STC = 0.3 // 0.3 kW = 300W panel
  private readonly EFF_DC_AC = 0.85
  private readonly LAT = 13.0838
  private readonly LON = 79.6663
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
      const url = `http://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${this.API_KEY}`
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
    const hourlyPredictions: Array<{ timestamp: number; power: number; energy: number }> = []
    
    // Generate predictions for next 12 hours (every 10 minutes = 72 points)
    let totalEnergy = 0
    
    for (let i = 0; i < 72; i++) {
      const timestamp = new Date(now.getTime() + i * 10 * 60 * 1000) // 10 minutes intervals
      const hourOfDay = timestamp.getHours()
      
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
      const pAc = pDc * this.EFF_DC_AC
      
      // Convert to energy (kWh) for 10-minute period
      const energy = pAc * (10 / 60) // 10 minutes = 10/60 hours
      totalEnergy += energy
      
      hourlyPredictions.push({
        timestamp: timestamp.getTime(),
        power: pAc,
        energy: energy
      })
    }

    return {
      energy12h: totalEnergy,
      hourlyPredictions,
      weatherData
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

  // Get hourly predictions for chart display
  getHourlyPredictions(predictions: PredictionResult): Array<{ time: string; predicted: number }> {
    return predictions.hourlyPredictions
      .filter((_, index) => index % 6 === 0) // Every hour (6 * 10min = 1 hour)
      .map(p => ({
        time: new Date(p.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        predicted: p.power
      }))
  }
}
