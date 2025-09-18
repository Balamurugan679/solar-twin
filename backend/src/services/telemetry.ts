export type PanelAttributes = {
  panelId: string;
  ratedKw: number; // panel peak rating at STC
  efficiency: number; // 0..1
  areaM2: number; // optional use by twin
};

export type TelemetryReading = {
  timestamp: number;
  energyKw: number;
  panel: PanelAttributes;
};

export type TelemetrySimulator = {
  onReading: (cb: (reading: TelemetryReading) => void | Promise<void>) => void;
};

export function createTelemetrySimulator(): TelemetrySimulator {
  const panel: PanelAttributes = {
    panelId: 'DEMO-001',
    ratedKw: 5,
    efficiency: 0.18,
    areaM2: 27.5,
  };

  const listeners = new Set<(r: TelemetryReading) => void | Promise<void>>();
  function emit(reading: TelemetryReading) {
    for (const l of listeners) l(reading);
  }

  // simple diurnal curve over 24h, accelerated clock
  const start = Date.now();
  const intervalMs = 1000; // 1s updates
  setInterval(() => {
    const t = Date.now();
    const seconds = (t - start) / 1000;
    const localHour = (seconds / 10) % 24; // accelerate: 10s per hour
    const sunAngle = Math.max(0, Math.sin(((localHour - 6) / 12) * Math.PI));
    const dirtLoss = 0.05 + 0.15 * Math.max(0, Math.sin(seconds / 120)); // varying dirt/smudge
    const noise = (Math.random() - 0.5) * 0.05;

    const idealKw = panel.ratedKw * sunAngle;
    const actualKw = Math.max(0, idealKw * (1 - dirtLoss + noise));

    emit({ timestamp: t, energyKw: actualKw, panel });
  }, intervalMs);

  return {
    onReading(cb) {
      listeners.add(cb);
    },
  };
}


