# Solar Twin Dashboard

A modular, production-ready demo to monitor solar energy production in real time with a digital twin prediction model, alerts, and simulated cleaning action.

## Stack
- Backend: Node.js + TypeScript, Express, WebSocket (`ws`)
- Frontend: React + Vite + TypeScript, Tailwind CSS, Recharts

## Features
- Live telemetry stream (dummy generator) over WebSocket
- Digital twin predicts optimal output based on temperature, humidity, cloud cover, sunlight
- Compare actual vs predicted; alert and cleaning simulation when deviation exceeds threshold
- Interactive charts and cards; modern, responsive UI

## Getting Started

### Prerequisites
- Node.js 18+

### Backend
```bash
cd backend
npm install
npm run dev
```
The backend will start at `http://localhost:4000` and expose `/api/*` plus a WebSocket at `/ws`.

Environment variables:
- `PORT` (default 4000)
- `ALERT_THRESHOLD` (default 0.2 -> 20%)
- `TS_WRITE_KEY` (optional) ThingSpeak Write API Key to publish telemetry

#### ThingSpeak Integration
If you provide `TS_WRITE_KEY`, the backend will publish a throttled update to ThingSpeak every ~16 seconds (free tier limit):
- **field1**: actual power (kW)
- **field2**: predicted power (kW)
- **field3**: deviation percent

Set the environment variable and run the backend:
```bash
export TS_WRITE_KEY=YOUR_THINGSPEAK_WRITE_KEY
cd backend && npm run dev
```
You can change the mapping or rate limit in `backend/src/services/thingspeak.ts`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend dev server starts at `http://localhost:5173` and proxies API/WS to the backend.

## Build & Run (Production)
```bash
# build backend
cd backend && npm run build
# build frontend
cd ../frontend && npm run build
```
Serve `frontend/dist` with any static server and run `backend` with `npm start`.

## Architecture
- `backend/src/services/telemetry.ts`: Simulates sensor readings
- `backend/src/services/weather.ts`: Provides synthetic weather snapshots
- `backend/src/services/digitalTwin.ts`: Predicts expected output
- `backend/src/services/alerts.ts`: Compares predicted vs actual and determines alert level
- `backend/src/services/cleaning.ts`: Simulates cleaning action
- `frontend/src/App.tsx`: Dashboard with charts and alerts

Designed to be modular to integrate real IoT devices, external weather APIs, and physical cleaning systems.

## Notes
- Replace `WeatherProvider` with calls to your weather API.
- Replace `createTelemetrySimulator` with IoT ingestion and emit readings into the same pipeline.
- Adjust the alert threshold to your operational policy.


