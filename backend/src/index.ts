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


