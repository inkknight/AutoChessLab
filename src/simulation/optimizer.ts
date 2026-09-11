import type { AggregateResult, ChessPiece, Relic, SimulationConfig, Talent, TrialResult } from './types';

export type OptimizationPhase = 'screen' | 'confirm' | 'refine';

export interface OptimizationChoice {
  level: number;
  relic: Relic;
  talent: Talent;
  bannedSynergy: string | null;
  useIo: boolean;
}

export interface OptimizationLocks {
  level: boolean;
  relic: boolean;
  talent: boolean;
  bannedSynergy: boolean;
  useIo: boolean;
}

export const DEFAULT_OPTIMIZATION_LOCKS: Readonly<OptimizationLocks> = {
  level: false,
  relic: false,
  talent: false,
  bannedSynergy: false,
  useIo: false,
};

export interface OptimizationSynergy {
  id: string;
  pieceIds: readonly string[];
}

export interface OptimizationEntry {
  choice: OptimizationChoice;
  aggregate: AggregateResult;
}

export interface RankedOptimizationEntry extends OptimizationEntry {
  rank: number;
  extraMeanGold: number;
}

export interface OptimizationRanking {
  entries: RankedOptimizationEntry[];
  reliabilityWarning: boolean;
}

export interface OptimizationProgress {
  phase: OptimizationPhase;
  completedTrials: number;
  totalTrials: number;
  completedConfigurations: number;
  totalConfigurations: number;
}

export interface OptimizationRunResult {
  requestedTrials: number;
  coarseTrials: number;
  candidateCount: number;
  confirmationCount: number;
  finalistCount: number;
  reliabilityWarning: boolean;
  rankings: RankedOptimizationEntry[];
}

export interface OptimizationRunOptions {
  simulate: (config: SimulationConfig, trialIndex: number) => TrialResult;
  aggregate: (results: readonly TrialResult[], level: number) => AggregateResult;
  isCancelled: () => boolean;
  onProgress: (progress: OptimizationProgress) => void;
  yieldControl: () => Promise<void>;
  batchSize: number;
}

export class OptimizationCancelledError extends Error {
  constructor() {
    super('Optimization cancelled');
    this.name = 'OptimizationCancelledError';
  }
}

export function enumerateOptimizationChoices(
  base: SimulationConfig,
  pieces: readonly ChessPiece[],
  synergies: readonly OptimizationSynergy[],
  locks: OptimizationLocks = DEFAULT_OPTIMIZATION_LOCKS,
): OptimizationChoice[] {
  const activeIds = new Set(pieces.map((piece) => piece.id));
  const targetIds = new Set(base.targets.map((target) => target.chessId));
  const legalBans = synergies
    .filter((synergy) => synergy.pieceIds.some((id) => activeIds.has(id)))
    .filter((synergy) => synergy.pieceIds.every((id) => !targetIds.has(id)))
    .map((synergy) => synergy.id)
    .sort();
  const bans: Array<string | null> = locks.bannedSynergy ? [base.bannedSynergy] : [null, ...legalBans];
  const levels = locks.level ? [base.level] : [5, 6, 7, 8, 9, 10];
  const relics: readonly Relic[] = locks.relic
    ? [base.relic]
    : ['none', 'weighted-dice', 'morning-star', 'remainder-seeker'];
  const talents: readonly Talent[] = locks.talent ? [base.talent] : ['greed', 'promotion'];
  const ioChoices = locks.useIo ? [base.useIo] : [false, true];
  const choices: OptimizationChoice[] = [];

  for (const level of levels) {
    for (const relic of relics) {
      for (const talent of talents) {
        for (const bannedSynergy of bans) {
          for (const useIo of ioChoices) {
            choices.push({ level, relic, talent, bannedSynergy, useIo });
          }
        }
      }
    }
  }
  return choices;
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareChoices(left: OptimizationChoice, right: OptimizationChoice): number {
  const relicOrder: readonly Relic[] = ['none', 'weighted-dice', 'morning-star', 'remainder-seeker'];
  return compareNumber(left.level, right.level)
    || compareNumber(relicOrder.indexOf(left.relic), relicOrder.indexOf(right.relic))
    || compareNumber(left.talent === 'greed' ? 0 : 1, right.talent === 'greed' ? 0 : 1)
    || (left.bannedSynergy ?? '').localeCompare(right.bannedSynergy ?? '')
    || compareNumber(Number(left.useIo), Number(right.useIo));
}

export function rankOptimizationEntries(
  entries: readonly OptimizationEntry[],
  limit: number,
  completionTolerance = 0.01,
): OptimizationRanking {
  const eligible = entries.filter((entry) => entry.aggregate.completedTrials > 0 && entry.aggregate.netGold !== null);
  if (eligible.length === 0 || limit <= 0) return { entries: [], reliabilityWarning: false };

  const maxCompletionRate = Math.max(...eligible.map((entry) => entry.aggregate.completionRate));
  const reliabilityWarning = maxCompletionRate < 0.95;
  const candidates = reliabilityWarning
    ? eligible
    : eligible.filter((entry) => entry.aggregate.completionRate + 1e-12 >= maxCompletionRate - completionTolerance);

  candidates.sort((left, right) => {
    if (reliabilityWarning) {
      const completion = compareNumber(right.aggregate.completionRate, left.aggregate.completionRate);
      if (completion !== 0) return completion;
    }
    return compareNumber(left.aggregate.netGold!.mean, right.aggregate.netGold!.mean)
      || compareNumber(left.aggregate.netGold!.p50, right.aggregate.netGold!.p50)
      || compareNumber(left.aggregate.netGold!.p90, right.aggregate.netGold!.p90)
      || compareNumber(left.aggregate.activeRerolls?.mean ?? Infinity, right.aggregate.activeRerolls?.mean ?? Infinity)
      || compareChoices(left.choice, right.choice);
  });

  const bestMean = candidates[0].aggregate.netGold!.mean;
  return {
    reliabilityWarning,
    entries: candidates.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
      extraMeanGold: entry.aggregate.netGold!.mean - bestMean,
    })),
  };
}

export function coarseTrialCount(_finalTrials: number): number {
  return 50;
}

export function buildPhaseConfig(
  base: SimulationConfig,
  choice: OptimizationChoice,
  phase: OptimizationPhase,
  trials: number,
): SimulationConfig {
  return {
    ...base,
    ...choice,
    trials,
    seed: `${base.seed}::optimize::${phase}`,
  };
}

interface PhaseResult {
  entries: OptimizationEntry[];
  samples: Map<string, TrialResult[]>;
}

function choiceKey(choice: OptimizationChoice): string {
  return `${choice.level}|${choice.relic}|${choice.talent}|${choice.bannedSynergy ?? ''}|${choice.useIo}`;
}

async function runPhase(
  base: SimulationConfig,
  choices: readonly OptimizationChoice[],
  phase: OptimizationPhase,
  trialsPerChoice: number,
  options: OptimizationRunOptions,
  priorSamples: ReadonlyMap<string, readonly TrialResult[]> = new Map(),
): Promise<PhaseResult> {
  const entries: OptimizationEntry[] = [];
  const samples = new Map<string, TrialResult[]>();
  const totalTrials = choices.length * trialsPerChoice;
  let phaseCompletedTrials = 0;

  for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex += 1) {
    const choice = choices[choiceIndex];
    const config = buildPhaseConfig(base, choice, phase, trialsPerChoice);
    const addedResults: TrialResult[] = [];
    for (let start = 0; start < trialsPerChoice; start += options.batchSize) {
      if (options.isCancelled()) throw new OptimizationCancelledError();
      const end = Math.min(trialsPerChoice, start + options.batchSize);
      for (let trialIndex = start; trialIndex < end; trialIndex += 1) {
        addedResults.push(options.simulate(config, trialIndex));
      }
      phaseCompletedTrials += end - start;
      options.onProgress({
        phase,
        completedTrials: phaseCompletedTrials,
        totalTrials,
        completedConfigurations: choiceIndex,
        totalConfigurations: choices.length,
      });
      await options.yieldControl();
      if (options.isCancelled()) throw new OptimizationCancelledError();
    }
    const combinedResults = [...(priorSamples.get(choiceKey(choice)) ?? []), ...addedResults];
    samples.set(choiceKey(choice), combinedResults);
    entries.push({ choice, aggregate: options.aggregate(combinedResults, config.level) });
    options.onProgress({
      phase,
      completedTrials: phaseCompletedTrials,
      totalTrials,
      completedConfigurations: choiceIndex + 1,
      totalConfigurations: choices.length,
    });
  }
  return { entries, samples };
}

export async function runOptimization(
  base: SimulationConfig,
  pieces: readonly ChessPiece[],
  synergies: readonly OptimizationSynergy[],
  options: OptimizationRunOptions,
  locks: OptimizationLocks = DEFAULT_OPTIMIZATION_LOCKS,
): Promise<OptimizationRunResult> {
  const choices = enumerateOptimizationChoices(base, pieces, synergies, locks);
  const coarseTrials = coarseTrialCount(base.trials);
  const screened = await runPhase(base, choices, 'screen', coarseTrials, options);
  const screenRanking = rankOptimizationEntries(screened.entries, 100, 0.04);
  const confirmationChoices = screenRanking.entries.map((entry) => entry.choice);
  const confirmed = await runPhase(base, confirmationChoices, 'confirm', 200, options, screened.samples);
  const confirmRanking = rankOptimizationEntries(confirmed.entries, 12);
  const finalists = confirmRanking.entries.map((entry) => entry.choice);
  const refined = await runPhase(base, finalists, 'refine', base.trials, options);
  const finalRanking = rankOptimizationEntries(refined.entries, 5);

  return {
    requestedTrials: base.trials,
    coarseTrials,
    candidateCount: choices.length,
    confirmationCount: confirmationChoices.length,
    finalistCount: finalists.length,
    reliabilityWarning: finalRanking.reliabilityWarning,
    rankings: finalRanking.entries,
  };
}
