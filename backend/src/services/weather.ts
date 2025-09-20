export type WeatherSnapshot = {
  temperatureC: number;
  humidity: number; // %
  cloudCover: number; // 0..1
  sunlightRatio: number; // 0..1 instantaneous proxy
};

export class WeatherProvider {
  async getCurrentWeather(): Promise<WeatherSnapshot> {
    // Keep simulator as fallback for pipeline
    const now = Date.now();
    const seconds = now / 1000;
    const hour = (seconds / 10) % 24;
    const diurnal = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));

    const temperatureC = 20 + 12 * diurnal + 2 * Math.sin(seconds / 300);
    const cloudCover = Math.min(1, Math.max(0, 0.3 + 0.3 * Math.sin(seconds / 200)));
    const humidity = 50 + 20 * Math.sin(seconds / 180);
    const sunlightRatio = diurnal * (1 - 0.6 * cloudCover);

    return { temperatureC, humidity, cloudCover, sunlightRatio };
  }
}

export async function fetchWeatherFromOpenWeatherMap(lat: number, lon: number): Promise<WeatherSnapshot> {
  const API_KEY = "2aabb707a4929ec328c31c34a79a912f"
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
  
  const res = await fetch(url, { headers: { 'accept': 'application/json' } as any })
  if (!res.ok) throw new Error(`OpenWeatherMap error: ${res.status}`)
  
  const data = await res.json() as any
  
  const main = data.main || {}
  const clouds = data.clouds || {}
  const weather = data.weather?.[0] || {}
  const sys = data.sys || {}
  
  const temperatureC = Number(main.temp ?? 20)
  const humidity = Number(main.humidity ?? 50)
  const cloudCover = Math.min(1, Math.max(0, Number(clouds.all ?? 50) / 100))
  
  // Enhanced sunlight ratio calculation using time of day and weather conditions
  let sunlightRatio = 0.5 // default
  
  // Get current hour to factor in day/night cycle
  const now = new Date()
  const currentHour = now.getHours()
  
  // Basic day/night cycle (0 at night, peak at noon)
  let dayFactor = 0
  if (currentHour >= 6 && currentHour <= 18) {
    const hourFromNoon = Math.abs(currentHour - 12)
    dayFactor = Math.max(0, Math.cos((hourFromNoon / 6) * (Math.PI / 2)))
  }
  
  // Weather condition factor
  const weatherMain = weather.main?.toLowerCase() || ''
  let weatherFactor = 0.7 // default
  
  if (weatherMain.includes('clear')) {
    weatherFactor = 0.95
  } else if (weatherMain.includes('few clouds') || weatherMain.includes('scattered')) {
    weatherFactor = 0.8
  } else if (weatherMain.includes('broken') || weatherMain.includes('overcast')) {
    weatherFactor = 0.4
  } else if (weatherMain.includes('rain') || weatherMain.includes('storm')) {
    weatherFactor = 0.2
  } else if (weatherMain.includes('snow')) {
    weatherFactor = 0.3
  }
  
  // Cloud cover factor (0-1)
  const cloudFactor = 1 - (cloudCover * 0.75)
  
  // Combine all factors
  sunlightRatio = dayFactor * weatherFactor * cloudFactor
  
  // Ensure ratio stays within bounds
  sunlightRatio = Math.max(0, Math.min(1, sunlightRatio))
  
  return { temperatureC, humidity, cloudCover, sunlightRatio }
}


