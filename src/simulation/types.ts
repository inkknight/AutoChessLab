export type Cost = 1 | 2 | 3 | 4 | 5;
export type Star = 1 | 2 | 3;
export type Relic = 'none' | 'weighted-dice' | 'morning-star' | 'remainder-seeker';
export type Talent = 'greed' | 'promotion';

export interface ChessPiece {
  id: string;
  name: string;
  cost: Cost;
  synergies: readonly string[];
  sourceOrder: number;
  copies?: number;
  icon?: string;
}

export interface SimulationTarget {
  chessId: string;
  copies: number;
}

export interface SimulationConfig {
  targets: readonly SimulationTarget[];
  level: number;
  relic: Relic;
  talent: Talent;
  useIo: boolean;
  bannedSynergy: string | null;
  trials: number;
  seed: string;
  maxActiveRerolls: number;
}

export interface ShopItem {
  kind: 'normal' | 'io' | 'ssr';
  chessId: string;
  cost: number;
  price: number;
  basePrice: number;
  ownedAtGeneration?: boolean;
}

export interface TrialCosts {
  leveling: number;
  reroll: number;
  purchases: number;
  ban: number;
  diceRefund: number;
}

export type IncompleteReason = 'impossible' | 'max-rerolls' | 'invalid-config';

export interface TrialResult {
  completed: boolean;
  reason?: IncompleteReason;
  netGold: number;
  activeRerolls: number;
  peakBenchSlots: number;
  costs: TrialCosts;
  ioPurchased: number;
  morningStarTriggers: number;
}

export interface MetricSummary {
  count: number;
  frequency: Record<number, number>;
  mean: number;
  variance: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface AggregateResult {
  totalTrials: number;
  completedTrials: number;
  incompleteTrials: number;
  completionRate: number;
  incompleteReasons: Partial<Record<IncompleteReason, number>>;
  occupancyLimit: number;
  peakOverLimitRate: number;
  netGold: MetricSummary | null;
  activeRerolls: MetricSummary | null;
  peakBenchSlots: MetricSummary | null;
  meanCosts: TrialCosts;
  meanIoPurchased: number;
  meanMorningStarTriggers: number;
}
