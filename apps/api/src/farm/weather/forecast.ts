import { localDay } from '@kithfield/farm';
import type { FarmPlace, LocalDate, Weather } from '@kithfield/contracts';
import { z } from 'zod';

/*
 * Reading WeatherKit's daily forecast into the farm's one weather for a day.
 *
 * The thresholds, checked in this order (the first that holds wins):
 * - rain: a precipitation chance of at least 50% with at least 1 mm expected, falling as anything
 *   but snow (rain, sleet, hail, mixed);
 * - frost: the day's low is at or below 0 °C, or snow is likely (at least 50%) and some falls;
 * - heat: the day's high is at or above 30 °C;
 * - otherwise none.
 * Rain wins over frost, and frost over heat: a wet day reads as rain on the farm, and a day with a
 * frosty morning and a hot afternoon is too rare to argue about.
 */

export const RAIN_CHANCE = 0.5;
export const RAIN_MM = 1;
export const FROST_MAX_LOW_C = 0;
export const HEAT_MIN_HIGH_C = 30;

/** The fields of WeatherKit's `DayWeatherConditions` this reads; the rest are ignored. */
const DayForecast = z.object({
  forecastStart: z.string(),
  temperatureMax: z.number(),
  temperatureMin: z.number(),
  precipitationChance: z.number().default(0),
  precipitationAmount: z.number().default(0),
  precipitationType: z.string().default('clear'),
  snowfallAmount: z.number().default(0),
});
export type DayForecast = z.infer<typeof DayForecast>;

export const DailyForecastResponse = z.object({
  forecastDaily: z.object({ days: z.array(DayForecast) }).optional(),
});

/** The farm's weather for one day of WeatherKit's forecast. */
export const weatherOf = (day: DayForecast): Weather => {
  const likely = day.precipitationChance >= RAIN_CHANCE;
  const snow = day.precipitationType === 'snow';
  if (likely && !snow && day.precipitationType !== 'clear' && day.precipitationAmount >= RAIN_MM) {
    return 'rain';
  }
  if (day.temperatureMin <= FROST_MAX_LOW_C || (likely && snow && day.snowfallAmount > 0)) {
    return 'frost';
  }
  if (day.temperatureMax >= HEAT_MIN_HIGH_C) return 'heat';
  return 'none';
};

/**
 * WeatherKit rolls hours up into days by a time zone, which a farm's place doesn't carry. The
 * place's longitude gives the solar zone (`Etc/GMT±N`, whole hours east or west of Greenwich),
 * within an hour or two of the town's own clock: close enough for a whole day's rain or frost.
 */
export const solarOffsetHours = (lng: number): number => {
  const hours = Math.round(lng / 15);
  return Math.max(-12, Math.min(12, hours)) + 0;
};

/** The IANA name of a solar zone; `Etc/GMT` names flip the sign (UTC+7 is `Etc/GMT-7`). */
export const solarZone = (lng: number): string => {
  const hours = solarOffsetHours(lng);
  if (hours === 0) return 'Etc/GMT';
  return hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${-hours}`;
};

/** The local day a forecast day starts on, in the solar zone of `lng`. */
export const forecastDay = (
  forecastStart: string,
  lng: number,
  timeZone?: string,
): LocalDate | null => {
  const at = Date.parse(forecastStart);
  if (Number.isNaN(at)) return null;
  // With the farm's own zone, the day starts where the farm's day starts.
  if (timeZone) return localDay(at + 12 * 3_600_000, timeZone);
  // Halfway through the day, so a zone a little off never lands on the day before.
  const noon = at + solarOffsetHours(lng) * 3_600_000 + 12 * 3_600_000;
  return new Date(noon).toISOString().slice(0, 10);
};

/** Coordinates to two decimals (about a kilometre): farms in one town share a fetch. */
export const roundedPlace = (place: FarmPlace): { lat: string; lng: string } => ({
  lat: place.lat.toFixed(2),
  lng: place.lng.toFixed(2),
});
