import { describe, expect, it } from 'vitest';
import { aggregateResults } from '../src/simulation/aggregate';
import {
  OptimizationCancelledError,
  runOptimization,
} from '../src/simulation/optimizer';
import type { ChessPiece, SimulationConfig, TrialResult } from '../src/simulation/types';
import type { WorkerRequest, WorkerResponse } from '../src/workers/protocol';

const base: SimulationConfig = {
  targets: [{ chessId: 'target', copies: 1 }],
  level: 8,
  relic: 'none',
  talent: 'greed',
  useIo: false,
  bannedSynergy: null,
  trials: 20,
  seed: 'optimization-protocol',
  maxActiveRerolls: 100,
};

const pieces: ChessPiece[] = [
  { id: 'target', name: '目标', cost: 1, synergies: ['is_target'], sourceOrder: 0 },
  { id: 'other', name: '其他', cost: 1, synergies: ['is_other'], sourceOrder: 1 },
];
const synergies = [
  { id: 'is_target', pieceIds: ['target'] },
  { id: 'is_other', pieceIds: ['other'] },
];

function completedTrial(netGold: number): TrialResult {
  return {
    completed: true,
    netGold,
    activeRerolls: netGold,
    peakBenchSlots: 1,
    costs: { reroll: netGold, purchases: 0, ban: 0, diceRefund: 0 },
    ioPurchased: 0,
    morningStarTriggers: 0,
  };
}

describe('successive-halving optimization orchestration', () => {
  it('screens all candidates, confirms 100, refines 12, and returns five rankings', async () => {
    const progress: Array<{ phase: string; completedConfigurations: number }> = [];
    const callsByPhase: Record<string, number> = {};
    const aggregateSizes: number[] = [];
    const result = await runOptimization(base, pieces, synergies, {
      simulate: (config, trialIndex) => {
        const phase = config.seed.split('::').at(-1) ?? '';
        callsByPhase[phase] = (callsByPhase[phase] ?? 0) + 1;
        return completedTrial(config.level * 10 + (config.useIo ? 1 : 0) + trialIndex % 2);
      },
      aggregate: (trials, level) => {
        aggregateSizes.push(trials.length);
        return aggregateResults(trials, level);
      },
      isCancelled: () => false,
      onProgress: (value) => progress.push(value),
      yieldControl: async () => {},
      batchSize: 100,
    });

    expect(result.candidateCount).toBe(6 * 4 * 2 * 2 * 2);
    expect(result.confirmationCount).toBe(100);
    expect(result.finalistCount).toBe(12);
    expect(result.rankings).toHaveLength(5);
    expect(callsByPhase.screen).toBe(result.candidateCount * 50);
    expect(callsByPhase.confirm).toBe(100 * 200);
    expect(callsByPhase.refine).toBe(12 * base.trials);
    expect(aggregateSizes.filter((size) => size === 250)).toHaveLength(100);
    expect(progress.map((item) => item.phase)).toEqual(expect.arrayContaining(['screen', 'confirm', 'refine']));
  });

  it('stops without publishing rankings when cancellation is observed', async () => {
    let calls = 0;
    await expect(runOptimization(base, pieces, synergies, {
      simulate: () => {
        calls += 1;
        return completedTrial(10);
      },
      aggregate: aggregateResults,
      isCancelled: () => calls >= 100,
      onProgress: () => {},
      yieldControl: async () => {},
      batchSize: 50,
    })).rejects.toBeInstanceOf(OptimizationCancelledError);
  });

  it('defines versioned optimization worker messages', () => {
    const request = { type: 'optimize', requestId: 'request', config: base } satisfies WorkerRequest;
    const progress = {
      type: 'optimization-progress',
      requestId: 'request',
      phase: 'confirm',
      completedTrials: 500,
      totalTrials: 1000,
      completedConfigurations: 1,
      totalConfigurations: 2,
    } satisfies WorkerResponse;

    expect(request.type).toBe('optimize');
    expect(progress.type).toBe('optimization-progress');
  });
});
