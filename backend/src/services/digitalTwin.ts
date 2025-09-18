import type { PanelAttributes } from './telemetry.js';
import type { WeatherSnapshot, WeatherProvider } from './weather.js';

export type Prediction = {
  energyKw: number;
};

export function createDigitalTwin(weatherProvider: WeatherProvider) {
  void weatherProvider; // reserved for future async fetch usage
  return {
    predict(panel: PanelAttributes, weather: WeatherSnapshot): Prediction {
      // Simple physical-ish model: PV output = rated * irradianceFactor * tempDerate * cloudFactor
      // Inputs: tempC, humidity, cloudCover(0..1), sunlightHoursRatio(0..1)
      const irradianceFactor = weather.sunlightRatio; // proxy for GHI
      const tempCoefficientPerC = -0.0045; // typical -0.45%/C above 25C
      const ambient = weather.temperatureC;
      const deltaT = Math.max(0, ambient - 25);
      const tempDerate = 1 + tempCoefficientPerC * deltaT;
      const cloudFactor = 1 - 0.75 * weather.cloudCover; // heavy clouds reduce ~75%
      const humidityDrag = 1 - 0.05 * (weather.humidity / 100); // small effect

      const factor = Math.max(0, irradianceFactor * tempDerate * cloudFactor * humidityDrag);
      const predictedKw = panel.ratedKw * factor;
      return { energyKw: predictedKw };
    },
  };
}


