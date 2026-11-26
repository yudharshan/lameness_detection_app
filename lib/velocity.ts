import type { VelocitySample } from '@/types/cattle';

const JITTER = [
  0.04, -0.03, 0.02, -0.01, 0.03, -0.04, 0.01, -0.02, 0.05, -0.03, 0.02,
  -0.01,
];

/**
 * Deterministic stride-velocity trace. A sine term models the natural
 * stance/swing speed oscillation; the jitter array adds frame-level noise.
 * Purged frames stay in the log for auditability but are excluded from
 * aggregate speed calculations.
 */
export function makeVelocityLog(
  base: number,
  purgedFrames: number[] = [],
  frames = 20,
  noise = 0.05,
): VelocitySample[] {
  return Array.from({ length: frames }, (_, index) => {
    const frame = index + 1;
    const cycle = Math.sin((index / frames) * Math.PI * 2) * 0.07;
    const jitter = JITTER[index % JITTER.length] * (noise / 0.05);

    return {
      frame,
      v: Number((base * (1 + cycle + jitter)).toFixed(2)),
      purged: purgedFrames.includes(frame),
    };
  });
}
