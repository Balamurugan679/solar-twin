export type AlertEvaluation = {
  level: 'ok' | 'warning' | 'critical';
  message: string;
  ratio: number;
  shouldClean: boolean;
};

export class AlertService {
  constructor(private thresholdRatio: number) {}

  evaluate(input: { actualKw: number; predictedKw: number; ratio: number }): AlertEvaluation | null {
    const { ratio, actualKw, predictedKw } = input;
    if (!isFinite(predictedKw) || predictedKw <= 0) return null;
    if (ratio < this.thresholdRatio) return { level: 'ok', message: 'Within expected range', ratio, shouldClean: false };
    if (ratio < this.thresholdRatio * 1.5) return { level: 'warning', message: 'Performance below expectation', ratio, shouldClean: false };
    return { level: 'critical', message: 'Significant performance drop detected', ratio, shouldClean: true };
  }
}


