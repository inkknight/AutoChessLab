import { describe, expect, it } from 'vitest';
import { createTrialRng, hashString, normalizeSimulationConfig, SeededRng } from '../src/simulation/rng';
import type { SimulationConfig } from '../src/simulation/types';

const config: SimulationConfig = {
  targets: [{ chessId: 'a', copies: 3 }],
  level: 8,
  relic: 'none',
  talent: 'greed',
  useIo: false,
  bannedSynergy: null,
  trials: 10,
  seed: 'same-seed',
  maxActiveRerolls: 100,
};

describe('seeded random streams', () => {
  it('produces the same sequence for the same 32-bit seed', () => {
    const left = new SeededRng(123);
    const right = new SeededRng(123);
    expect(Array.from({ length: 20 }, () => left.next())).toEqual(
      Array.from({ length: 20 }, () => right.next()),
    );
  });

  it('derives a stable independent stream for each trial', () => {
    const a = createTrialRng(config, 7);
    const b = createTrialRng({ ...config, trials: 999 }, 7);
    const c = createTrialRng(config, 8);
    expect(Array.from({ length: 8 }, () => a.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => b.nextUint32()),
    );
    expect(c.nextUint32()).not.toBe(createTrialRng(config, 7).nextUint32());
  });

  it('normalizes object keys and excludes batch-only trial count', () => {
    expect(normalizeSimulationConfig({ ...config, trials: 1 })).toBe(
      normalizeSimulationConfig({ ...config, trials: 500 }),
    );
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('supports deterministic integer and chance helpers', () => {
    const rng = new SeededRng(42);
    const values = Array.from({ length: 100 }, () => rng.int(2, 4));
    expect(values.every((value) => value >= 2 && value <= 4)).toBe(true);
    expect(new SeededRng(1).chance(1)).toBe(true);
    expect(new SeededRng(1).chance(0)).toBe(false);
  });
});
