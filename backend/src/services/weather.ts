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

export async function fetchWeatherFromOpenMeteo(lat: number, lon: number): Promise<WeatherSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,cloud_cover&hourly=shortwave_radiation&timezone=auto`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } as any });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = await res.json() as any;
  const current = data.current || {};
  const temperatureC = Number(current.temperature_2m ?? 20);
  const humidity = Number(current.relative_humidity_2m ?? 50);
  const cloudCover = Math.min(1, Math.max(0, Number(current.cloud_cover ?? 50) / 100));

  // Approximate sunlight ratio using hourly shortwave radiation vs a typical clear-sky max
  let sunlightRatio = 0.0;
  try {
    const hourly = data.hourly || {};
    const timeIndex = (hourly.time as string[] | undefined)?.indexOf(current.time);
    if (timeIndex != null && timeIndex >= 0) {
      const sw = Number((hourly.shortwave_radiation as number[] | undefined)?.[timeIndex] ?? 0);
      const clearSkyTypical = 800; // W/m2
      sunlightRatio = Math.max(0, Math.min(1, sw / clearSkyTypical));
    }
  } catch {}

  return { temperatureC, humidity, cloudCover, sunlightRatio };
}


