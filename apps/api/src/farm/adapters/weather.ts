import type { WeatherProvider } from '../ports';

/**
 * No weather source is connected yet, so there is no weather to report. The farm writes nothing,
 * which every device reads as "no weather today"; it never makes weather up.
 */
export const noWeather: WeatherProvider = {
  today: () => Promise.resolve(null),
};
