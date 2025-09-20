import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { createTelemetrySimulator } from './services/telemetry';
import { ThingSpeakClient } from './services/thingspeak';
import { createDigitalTwin } from './services/digitalTwin';
import { AlertService } from './services/alerts';
import { CleaningService } from './services/cleaning';
import { WeatherProvider, fetchWeatherFromOpenMeteo } from './services/weather';
import { fetchOpenWeather, resampleToFiveMinutes } from './services/openweather';

const PORT = Number(process.env.PORT || 4000);
const THRESHOLD = Number(process.env.ALERT_THRESHOLD || 0.2); // 20%

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const weatherProvider = new WeatherProvider();
const twin = createDigitalTwin(weatherProvider);
const alerts = new AlertService(THRESHOLD);
const cleaning = new CleaningService();
const telemetry = createTelemetrySimulator();
const thingspeakKey = process.env.TS_WRITE_KEY;
const thingSpeak = thingspeakKey ? new ThingSpeakClient({ apiKey: thingspeakKey }) : null;

type Subscriber = { send: (msg: string) => void };

const subscribers = new Set<Subscriber>();
wss.on('connection', (ws) => {
  subscribers.add(ws as unknown as Subscriber);
  ws.on('close', () => subscribers.delete(ws as unknown as Subscriber));
});

function broadcast(payload: unknown) {
  const str = JSON.stringify(payload);
  for (const ws of subscribers) {
    try { ws.send(str); } catch {}
  }
}

// REST endpoints
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/config', (_req, res) => {
  res.json({ threshold: THRESHOLD });
});

app.post('/api/clean', async (_req, res) => {
  const result = await cleaning.triggerCleaning();
  res.json(result);
});

app.get('/api/weather', async (_req, res) => {
  const w = await weatherProvider.getCurrentWeather();
  res.json(w);
});

app.get('/api/weather/current', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }
    const snapshot = await fetchWeatherFromOpenMeteo(lat, lon);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

// OpenWeather current conditions + alerts
app.get('/api/openweather/current', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'lat and lon are required' });
    const apiKey = process.env.OWM_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OWM_API_KEY not set' });
    const owm = await fetchOpenWeather(lat, lon, apiKey);
    const current = owm.current;
    const alerts = (owm as any).alerts || [];
    res.json({ current, alerts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch OpenWeather current' });
  }
});

// Prediction series from OpenWeather, resampled to 5 minutes for +/-2h
app.get('/api/prediction/openweather', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'lat and lon are required' });
    const apiKey = process.env.OWM_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OWM_API_KEY not set' });
    const owm = await fetchOpenWeather(lat, lon, apiKey);
    const nowMs = Date.now();
    const ratedKw = 5; // align with simulator
    const series = resampleToFiveMinutes(nowMs, owm.hourly, ratedKw);
    res.json({ series });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build prediction series' });
  }
});

// Geocoding endpoint - reverse geocode coordinates to city name
app.get('/api/geocode', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }

    let cityName = '';
    
    // Check for known locations first (quick lookup)
    const knownLocations: { [key: string]: string } = {
      '13.0083,80.0056': 'Chennai, Tamil Nadu, India',
      '13.00829,80.00558': 'Chennai, Tamil Nadu, India',
      '12.9716,77.5946': 'Bangalore, Karnataka, India',
      '19.0760,72.8777': 'Mumbai, Maharashtra, India',
      '28.7041,77.1025': 'Delhi, India',
      '22.5726,88.3639': 'Kolkata, West Bengal, India'
    };
    
    const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    cityName = knownLocations[coordKey] || knownLocations[`${lat.toFixed(5)},${lon.toFixed(5)}`] || '';
    
    // Try Open-Meteo geocoding if not found in known locations
    if (!cityName) {
      try {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en`);
        const geoData = await geoResponse.json();
        if (geoData.results && geoData.results[0]) {
          const result = geoData.results[0];
          const parts = [result.name, result.admin1, result.country].filter(Boolean);
          cityName = parts.join(', ');
        }
      } catch (error) {
        console.warn('Open-Meteo geocoding failed:', error);
      }
    }

    // Fallback to coordinates if geocoding fails
    if (!cityName) {
      cityName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }

    res.json({ cityName });
  } catch (err) {
    console.error('Geocoding error:', err);
    res.status(500).json({ error: 'Failed to geocode location' });
  }
});

// News proxy endpoint - keeps API key secure on backend
app.get('/api/news', async (req, res) => {
  try {
    const topic = req.query.topic as string;
    if (!topic) return res.status(400).json({ error: 'topic parameter is required' });
    
    const apiKey = process.env.NEWSDATA_API_KEY;
    
    // If no API key or it's invalid, return mock data for demo purposes
    if (!apiKey || apiKey === '13851dc74c8944a58e0b7209d4154320') {
      console.log('Using mock news data for topic:', topic);
      const mockNews = generateMockNews(topic);
      return res.json({ results: mockNews });
    }
    
    const encodedTopic = encodeURIComponent(topic);
    const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodedTopic}`;
    
    console.log('Fetching news for topic:', topic);
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('NewsData API error:', data);
      // Fallback to mock data if API fails
      const mockNews = generateMockNews(topic);
      return res.json({ results: mockNews });
    }
    
    res.json({ results: data.results || [] });
  } catch (err) {
    console.error('News fetch error:', err);
    // Fallback to mock data on error
    const mockNews = generateMockNews(req.query.topic as string);
    res.json({ results: mockNews });
  }
});

// Mock news generator for demo purposes
function generateMockNews(topic: string) {
  const isWeather = topic.toLowerCase().includes('weather') || topic.toLowerCase().includes('meteorology');
  const isGemology = topic.toLowerCase().includes('gemology') || topic.toLowerCase().includes('gemstone') || topic.toLowerCase().includes('diamond');
  
  if (isWeather) {
    return [
      {
        title: "Solar Energy Forecast: Bright Outlook for Renewable Power Generation",
        link: "https://example.com/solar-forecast",
        description: "Latest meteorological data shows optimal conditions for solar panel efficiency across multiple regions.",
        source_id: "solar-news",
        pubDate: new Date().toISOString()
      },
      {
        title: "Weather Patterns Favor Solar Energy Production This Week",
        link: "https://example.com/weather-solar",
        description: "Clear skies and optimal sun angles expected to boost solar panel output by 15-20%.",
        source_id: "weather-forecast",
        pubDate: new Date(Date.now() - 3600000).toISOString()
      },
      {
        title: "Meteorological Advances Improve Solar Energy Predictions",
        link: "https://example.com/meteorology-solar",
        description: "New weather modeling techniques provide more accurate solar irradiance forecasts.",
        source_id: "meteorology-today",
        pubDate: new Date(Date.now() - 7200000).toISOString()
      }
    ];
  } else if (isGemology) {
    return [
      {
        title: "New Diamond Discovery Could Revolutionize Solar Panel Technology",
        link: "https://example.com/diamond-solar",
        description: "Researchers discover diamond-based materials that could improve solar panel efficiency by 30%.",
        source_id: "gemology-weekly",
        pubDate: new Date().toISOString()
      },
      {
        title: "Gemstone Industry Embraces Sustainable Solar Energy Solutions",
        link: "https://example.com/gemstone-solar",
        description: "Leading gemstone companies invest in solar-powered mining operations for environmental sustainability.",
        source_id: "mining-news",
        pubDate: new Date(Date.now() - 1800000).toISOString()
      },
      {
        title: "Crystal Structures Inspire Next-Generation Solar Cell Design",
        link: "https://example.com/crystal-solar",
        description: "Scientists study gemstone crystal formations to develop more efficient photovoltaic materials.",
        source_id: "science-daily",
        pubDate: new Date(Date.now() - 5400000).toISOString()
      }
    ];
  }
  
  return [
    {
      title: "Solar Technology Advances: Latest Developments in Renewable Energy",
      link: "https://example.com/solar-tech",
      description: "Recent breakthroughs in solar panel technology promise increased efficiency and lower costs.",
      source_id: "tech-news",
      pubDate: new Date().toISOString()
    }
  ];
}

// Stream loop: combine telemetry with twin prediction and emit
telemetry.onReading(async (reading) => {
  const weather = await weatherProvider.getCurrentWeather();
  const predicted = twin.predict(reading.panel, weather);
  const diff = predicted.energyKw - reading.energyKw;
  const ratio = Math.abs(diff) / Math.max(predicted.energyKw, 0.001);

  const alert = alerts.evaluate({
    actualKw: reading.energyKw,
    predictedKw: predicted.energyKw,
    ratio,
  });

  if (alert?.shouldClean) {
    // fire-and-forget cleaning simulation
    cleaning.triggerCleaning().catch(() => {});
  }

  broadcast({
    type: 'telemetry',
    data: {
      timestamp: reading.timestamp,
      actualKw: reading.energyKw,
      predictedKw: predicted.energyKw,
      weather,
      ratio,
      alert,
    },
  });

  // Publish to ThingSpeak (fields: choose mapping)
  if (thingSpeak) {
    void thingSpeak.postUpdate({
      field1: Number(reading.energyKw.toFixed(3)),
      field2: Number(predicted.energyKw.toFixed(3)),
      field3: Number((ratio * 100).toFixed(2)), // % deviation
    });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
});


