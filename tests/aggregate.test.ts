import { describe, expect, it } from 'vitest';
import { aggregateResults } from '../src/simulation/aggregate';
import type { TrialResult } from '../src/simulation/types';

const trial = (netGold: number, completed = true): TrialResult => ({
  completed,
  ...(completed ? {} : { reason: 'max-rerolls' as const }),
  netGold,
  activeRerolls: netGold / 2,
  peakBenchSlots: netGold,
  costs: { leveling: 48, reroll: netGold, purchases: 2, ban: 3, diceRefund: 1 },
  ioPurchased: 1,
  morningStarTriggers: 0,
});

describe('aggregateResults', () => {
  it('measures occupancy overflow above player level plus eight bench slots', () => {
    const aggregate = aggregateResults([trial(13), trial(14), trial(15)], 6);
    expect(aggregate.occupancyLimit).toBe(14);
    expect(aggregate.peakOverLimitRate).toBe(1 / 3);
  });

  it('computes integer frequencies, population variance, and nearest-rank percentiles', () => {
    const aggregate = aggregateResults([trial(1), trial(2), trial(3), trial(4)], 8);
    expect(aggregate.netGold?.frequency).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1 });
    expect(aggregate.netGold?.mean).toBe(2.5);
    expect(aggregate.netGold?.variance).toBe(1.25);
    expect(aggregate.netGold?.p50).toBe(2);
    expect(aggregate.netGold?.p95).toBe(4);
  });

  it('excludes incomplete trials from metric summaries', () => {
    const aggregate = aggregateResults([trial(2), trial(100, false)], 8);
    expect(aggregate.totalTrials).toBe(2);
    expect(aggregate.completedTrials).toBe(1);
    expect(aggregate.completionRate).toBe(0.5);
    expect(aggregate.netGold?.max).toBe(2);
    expect(aggregate.incompleteReasons).toEqual({ 'max-rerolls': 1 });
  });

  it('aggregates the level-up spending component', () => {
    const aggregate = aggregateResults([trial(2), trial(4)], 7);
    expect(aggregate.meanCosts.leveling).toBe(48);
  });

  it('returns null summaries and zero means when no trial completes', () => {
    const aggregate = aggregateResults([trial(100, false)], 8);
    expect(aggregate.netGold).toBeNull();
    expect(aggregate.meanCosts).toEqual({ leveling: 0, reroll: 0, purchases: 0, ban: 0, diceRefund: 0 });
  });
});
