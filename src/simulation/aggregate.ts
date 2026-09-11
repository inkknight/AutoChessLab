import type { AggregateResult, MetricSummary, TrialCosts, TrialResult } from './types';

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function summarize(values: readonly number[]): MetricSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const frequency: Record<number, number> = {};
  for (const value of values) frequency[value] = (frequency[value] ?? 0) + 1;
  return {
    count: values.length,
    frequency,
    mean,
    variance,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
  };
}

export function aggregateResults(results: readonly TrialResult[], level: number): AggregateResult {
  const completed = results.filter((trial) => trial.completed);
  const occupancyLimit = level + 8;
  const incompleteReasons: AggregateResult['incompleteReasons'] = {};
  for (const trial of results) {
    if (!trial.completed && trial.reason) incompleteReasons[trial.reason] = (incompleteReasons[trial.reason] ?? 0) + 1;
  }
  const mean = (select: (trial: TrialResult) => number): number =>
    completed.length === 0 ? 0 : completed.reduce((sum, trial) => sum + select(trial), 0) / completed.length;
  const meanCosts: TrialCosts = {
    leveling: mean((trial) => trial.costs.leveling),
    reroll: mean((trial) => trial.costs.reroll),
    purchases: mean((trial) => trial.costs.purchases),
    ban: mean((trial) => trial.costs.ban),
    diceRefund: mean((trial) => trial.costs.diceRefund),
  };
  return {
    totalTrials: results.length,
    completedTrials: completed.length,
    incompleteTrials: results.length - completed.length,
    completionRate: results.length === 0 ? 0 : completed.length / results.length,
    incompleteReasons,
    occupancyLimit,
    peakOverLimitRate: completed.length === 0 ? 0 : completed.filter((trial) => trial.peakBenchSlots > occupancyLimit).length / completed.length,
    netGold: summarize(completed.map((trial) => trial.netGold)),
    activeRerolls: summarize(completed.map((trial) => trial.activeRerolls)),
    peakBenchSlots: summarize(completed.map((trial) => trial.peakBenchSlots)),
    meanCosts,
    meanIoPurchased: mean((trial) => trial.ioPurchased),
    meanMorningStarTriggers: mean((trial) => trial.morningStarTriggers),
  };
}
