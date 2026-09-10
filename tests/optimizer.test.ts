import { describe, expect, it } from 'vitest';
import {
  buildPhaseConfig,
  coarseTrialCount,
  enumerateOptimizationChoices,
  rankOptimizationEntries,
  type OptimizationChoice,
  type OptimizationEntry,
} from '../src/simulation/optimizer';
import type { AggregateResult, ChessPiece, MetricSummary, SimulationConfig } from '../src/simulation/types';

const base: SimulationConfig = {
  targets: [{ chessId: 'target', copies: 3 }],
  level: 8,
  relic: 'morning-star',
  talent: 'greed',
  useIo: false,
  bannedSynergy: null,
  trials: 10_000,
  seed: 'optimizer-seed',
  maxActiveRerolls: 5000,
};

const pieces: ChessPiece[] = [
  { id: 'target', name: '目标', cost: 2, synergies: ['is_target'], sourceOrder: 0 },
  { id: 'other', name: '其他', cost: 2, synergies: ['is_useful'], sourceOrder: 1 },
];

function metric(mean: number, p50 = mean, p90 = mean): MetricSummary {
  return {
    count: 100,
    frequency: { [mean]: 100 },
    mean,
    variance: 0,
    min: mean,
    max: mean,
    p10: mean,
    p25: mean,
    p50,
    p75: mean,
    p90,
    p95: mean,
  };
}

function aggregate(completionRate: number, meanGold: number | null): AggregateResult {
  const completedTrials = Math.round(completionRate * 100);
  return {
    totalTrials: 100,
    completedTrials,
    incompleteTrials: 100 - completedTrials,
    completionRate,
    incompleteReasons: completionRate < 1 ? { 'max-rerolls': 100 - completedTrials } : {},
    occupancyLimit: 16,
    peakOverLimitRate: 0,
    netGold: meanGold === null ? null : metric(meanGold),
    activeRerolls: meanGold === null ? null : metric(10),
    peakBenchSlots: meanGold === null ? null : metric(4),
    meanCosts: { reroll: 0, purchases: 0, ban: 0, diceRefund: 0 },
    meanIoPurchased: 0,
    meanMorningStarTriggers: 0,
  };
}

function choice(level: number): OptimizationChoice {
  return { level, relic: 'none', talent: 'greed', bannedSynergy: null, useIo: false };
}

function entry(selected: OptimizationChoice, result: AggregateResult): OptimizationEntry {
  return { choice: selected, aggregate: result };
}

describe('optimization candidate enumeration', () => {
  it('enumerates every level, talent, legal effective Ban, and IO choice', () => {
    const choices = enumerateOptimizationChoices(base, pieces, [
      { id: 'is_target', pieceIds: ['target'] },
      { id: 'is_useful', pieceIds: ['other'] },
      { id: 'is_empty', pieceIds: ['inactive'] },
    ]);

    expect(choices).toHaveLength(6 * 4 * 2 * 2 * 2);
    expect(choices.some((choice) => choice.level < 5 || choice.level > 10)).toBe(false);
    expect(new Set(choices.map((choice) => choice.relic))).toEqual(new Set([
      'none',
      'weighted-dice',
      'morning-star',
      'remainder-seeker',
    ]));
    expect(choices.some((choice) => choice.bannedSynergy === 'is_target')).toBe(false);
    expect(choices.some((choice) => choice.bannedSynergy === 'is_empty')).toBe(false);
    expect(choices[0]).toEqual({ level: 5, relic: 'none', talent: 'greed', bannedSynergy: null, useIo: false });
  });

  it('uses fifty trials for the initial screen', () => {
    expect(coarseTrialCount(10_000)).toBe(50);
    expect(coarseTrialCount(50_000)).toBe(50);
    expect(coarseTrialCount(100_000)).toBe(50);
  });

  it('keeps fixed inputs and derives a phase-specific deterministic seed', () => {
    const choice = { level: 6, relic: 'weighted-dice' as const, talent: 'promotion' as const, bannedSynergy: 'is_useful', useIo: true };
    const screen = buildPhaseConfig(base, choice, 'screen', 50);
    const confirm = buildPhaseConfig(base, choice, 'confirm', 400);
    const refine = buildPhaseConfig(base, choice, 'refine', 10_000);

    expect(screen).toMatchObject({
      targets: base.targets,
      relic: 'weighted-dice',
      level: 6,
      talent: 'promotion',
      bannedSynergy: 'is_useful',
      useIo: true,
      maxActiveRerolls: 5000,
      trials: 50,
    });
    expect(screen.seed).toBe('optimizer-seed::optimize::screen');
    expect(confirm.seed).toBe('optimizer-seed::optimize::confirm');
    expect(refine.seed).toBe('optimizer-seed::optimize::refine');
  });
});

describe('optimization ranking', () => {
  it('filters candidates more than one point below a reliable best completion rate', () => {
    const ranked = rankOptimizationEntries([
      entry(choice(5), aggregate(0.995, 60)),
      entry(choice(6), aggregate(0.98, 20)),
      entry(choice(7), aggregate(0.99, 50)),
    ], 5);

    expect(ranked.reliabilityWarning).toBe(false);
    expect(ranked.entries.map((item) => item.choice.level)).toEqual([7, 5]);
  });

  it('supports a wider completion-rate tolerance for low-sample screening', () => {
    const ranked = rankOptimizationEntries([
      entry(choice(5), aggregate(1, 60)),
      entry(choice(6), aggregate(0.96, 20)),
      entry(choice(7), aggregate(0.94, 10)),
    ], 100, 0.04);

    expect(ranked.entries.map((item) => item.choice.level)).toEqual([6, 5]);
  });

  it('prioritizes completion rate when no candidate reaches 95 percent', () => {
    const ranked = rankOptimizationEntries([
      entry(choice(5), aggregate(0.80, 20)),
      entry(choice(6), aggregate(0.90, 40)),
    ], 5);

    expect(ranked.reliabilityWarning).toBe(true);
    expect(ranked.entries[0].choice.level).toBe(6);
  });

  it('excludes entries without completed samples and assigns stable deltas', () => {
    const ranked = rankOptimizationEntries([
      entry(choice(8), aggregate(1, 42)),
      entry(choice(7), aggregate(1, 40)),
      entry(choice(6), aggregate(0, null)),
    ], 2);

    expect(ranked.entries.map((item) => [item.rank, item.choice.level, item.extraMeanGold])).toEqual([
      [1, 7, 0],
      [2, 8, 2],
    ]);
  });
});
