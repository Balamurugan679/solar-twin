import axios from 'axios';

export type ThingSpeakConfig = {
  apiKey: string; // Write API key
  channelId?: string; // optional, not required for write
  baseUrl?: string; // override for testing; default ThingSpeak API
};

export type ThingSpeakFields = Partial<{
  field1: number | string;
  field2: number | string;
  field3: number | string;
  field4: number | string;
  field5: number | string;
  field6: number | string;
  field7: number | string;
  field8: number | string;
}>;

export class ThingSpeakClient {
  private lastPostMs = 0;
  private minIntervalMs: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(cfg: ThingSpeakConfig & { minIntervalMs?: number }) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl || 'https://api.thingspeak.com';
    this.minIntervalMs = cfg.minIntervalMs ?? 16000; // TS free: ~15s minimum
  }

  setMinInterval(ms: number) {
    this.minIntervalMs = ms;
  }

  canPostNow(): boolean {
    const now = Date.now();
    return now - this.lastPostMs >= this.minIntervalMs;
  }

  async postUpdate(fields: ThingSpeakFields): Promise<void> {
    const now = Date.now();
    if (!this.canPostNow()) return; // silently skip to respect rate limit
    try {
      await axios.post(`${this.baseUrl}/update.json`, {
        api_key: this.apiKey,
        ...fields,
      }, {
        timeout: 8000,
        headers: { 'Content-Type': 'application/json' },
      });
      this.lastPostMs = now;
    } catch (err) {
      // swallow errors to keep stream running
    }
  }
}


