/*
 * The speaker's own voice for captions, as LiveKit's audio sink hands it over: 16-bit mono PCM at
 * the rate WebRTC captures at, which the sink doesn't say. Pieces are brought down to 16 kHz (what
 * speech models listen at, and small enough to send) and wrapped as WAV.
 */

/** Rates WebRTC captures at on a phone. */
const RATES = [8000, 16000, 24000, 32000, 44100, 48000] as const;

/** The capture rate, from how many bytes arrived over how long: the nearest rate a phone uses. */
export function rateOf(bytes: number, ms: number): number {
  if (ms <= 0) return 48000;
  const heard = bytes / 2 / (ms / 1000);
  let best: number = RATES[RATES.length - 1] ?? 48000;
  for (const r of RATES) if (Math.abs(r - heard) < Math.abs(best - heard)) best = r;
  return best;
}

export const TARGET_RATE = 16000;

/** Little-endian 16-bit samples from bytes (an odd trailing byte is dropped). */
export function samplesOf(bytes: Uint8Array): Int16Array {
  const n = bytes.length >> 1;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = (bytes[2 * i] ?? 0) | ((bytes[2 * i + 1] ?? 0) << 8);
    out[i] = v >= 0x8000 ? v - 0x10000 : v;
  }
  return out;
}

/** Down to 16 kHz, averaging each output sample's span of input (a plain low-pass as it goes). */
export function toTargetRate(samples: Int16Array, rate: number): Int16Array {
  if (rate <= TARGET_RATE) return samples;
  const step = rate / TARGET_RATE;
  const n = Math.floor(samples.length / step);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * step);
    const to = Math.min(samples.length, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = from; j < to; j++) sum += samples[j] ?? 0;
    out[i] = Math.round(sum / Math.max(1, to - from));
  }
  return out;
}

/** Whether a piece has someone talking in it, not just the room: its loudness over a floor. */
export function hasVoice(samples: Int16Array, floor = 500): boolean {
  if (samples.length === 0) return false;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length) >= floor;
}

/** Samples as a 16-bit mono WAV file. */
export function wavOf(samples: Int16Array, rate: number): Uint8Array {
  const data = samples.length * 2;
  const out = new Uint8Array(44 + data);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i] ?? 0, true);
  return out;
}
