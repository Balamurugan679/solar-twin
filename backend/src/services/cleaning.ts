export type CleaningResult = {
  startedAt: number;
  status: 'triggered' | 'completed';
  durationSec: number;
};

export class CleaningService {
  async triggerCleaning(): Promise<CleaningResult> {
    const startedAt = Date.now();
    // simulate a cleaning process lasting a few seconds
    const durationSec = 3;
    await new Promise((r) => setTimeout(r, durationSec * 1000));
    return { startedAt, status: 'completed', durationSec };
  }
}


