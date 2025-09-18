import type { WeatherSnapshot } from './weather';

export type OpenWeatherOneCall = {
  lat: number;
  lon: number;
  timezone: string;
  current: { dt: number; temp: number; humidity: number; clouds: number; uvi?: number };
  hourly: Array<{ dt: number; temp: number; humidity: number; clouds: number; uvi?: number }>;
};

export async function fetchOpenWeather(lat: number, lon: number, apiKey: string): Promise<OpenWeatherOneCall> {
  const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } as any });
  if (!res.ok) throw new Error(`OpenWeather error: ${res.status}`);
  return res.json() as Promise<OpenWeatherOneCall>;
}

export function mapToSnapshot(entry: { temp: number; humidity: number; clouds: number; uvi?: number }): WeatherSnapshot {
  const temperatureC = entry.temp;
  const humidity = entry.humidity;
  const cloudCover = Math.min(1, Math.max(0, (entry.clouds ?? 50) / 100));
  // Use UV index (0..11+) as proxy for irradiance ratio when available
  const sunlightRatio = entry.uvi != null ? Math.max(0, Math.min(1, entry.uvi / 8)) : Math.max(0, 1 - cloudCover);
  return { temperatureC, humidity, cloudCover, sunlightRatio };
}

export function predictKwFromSnapshot(snapshot: WeatherSnapshot, ratedKw: number): number {
  const irradianceFactor = snapshot.sunlightRatio;
  const tempCoefficientPerC = -0.0045;
  const ambient = snapshot.temperatureC;
  const deltaT = Math.max(0, ambient - 25);
  const tempDerate = 1 + tempCoefficientPerC * deltaT;
  const cloudFactor = 1 - 0.75 * snapshot.cloudCover;
  const humidityDrag = 1 - 0.05 * (snapshot.humidity / 100);
  const factor = Math.max(0, irradianceFactor * tempDerate * cloudFactor * humidityDrag);
  return ratedKw * factor;
}

export function resampleToFiveMinutes(nowMs: number, hourly: Array<{ dt: number; temp: number; humidity: number; clouds: number; uvi?: number }>, ratedKw: number) {
  // Build a map of hour -> snapshot
  const byTs = hourly.map(h => ({ tsMs: h.dt * 1000, snap: mapToSnapshot(h) }));
  // Generate points every 5 minutes for +/- 2 hours
  const start = nowMs - 2 * 60 * 60 * 1000;
  const end = nowMs + 2 * 60 * 60 * 1000;
  const step = 5 * 60 * 1000;
  const series: Array<{ t: number; predicted: number }> = [];
  for (let t = start; t <= end; t += step) {
    // find surrounding hourly points for linear interpolation
    let prev = byTs[0];
    let next = byTs[byTs.length - 1];
    for (let i = 0; i < byTs.length; i++) {
      if (byTs[i].tsMs <= t) prev = byTs[i];
      if (byTs[i].tsMs >= t) { next = byTs[i]; break; }
    }
    const span = Math.max(1, next.tsMs - prev.tsMs);
    const w = Math.max(0, Math.min(1, (t - prev.tsMs) / span));
    const interp: WeatherSnapshot = {
      temperatureC: prev.snap.temperatureC * (1 - w) + next.snap.temperatureC * w,
      humidity: prev.snap.humidity * (1 - w) + next.snap.humidity * w,
      cloudCover: prev.snap.cloudCover * (1 - w) + next.snap.cloudCover * w,
      sunlightRatio: prev.snap.sunlightRatio * (1 - w) + next.snap.sunlightRatio * w,
    };
    const predicted = predictKwFromSnapshot(interp, ratedKw);
    series.push({ t, predicted: Number(predicted.toFixed(3)) });
  }
  return series;
}


