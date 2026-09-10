import type { RandomSource } from './rng';
import type { ShopItem } from './types';

export interface WeightedDiceResult {
  refund: number;
  streak: number;
}

export function settleWeightedDice(
  shop: readonly ShopItem[],
  ownedBasePieces: ReadonlySet<string>,
  previousStreak: number,
  rng: RandomSource,
): WeightedDiceResult {
  if (shop.some((item) => ownedBasePieces.has(item.chessId))) return { refund: 0, streak: 0 };
  const streak = previousStreak + 1;
  return { refund: rng.chance(Math.min(1, 5 / streak)) ? 1 : 2, streak };
}
