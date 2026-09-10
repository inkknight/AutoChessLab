import type { Cost } from '../simulation/types';

export const SHOP_SIZE = 5;
export const REROLL_COST = 2;
export const IO_PRICE = 5;
export const IO_CHANCE = 20 / 10_000;
export const SSR_FIRST_ROLL_CHANCE = 1 / 10_000;
export const SSR_SECOND_ROLL_CHANCE = 1 / 10_000;
export const PROMOTION_CHANCE = 0.5;
export const DEFAULT_COPIES_BY_COST: Readonly<Record<Cost, number>> = {
  1: 20,
  2: 20,
  3: 15,
  4: 15,
  5: 10,
};
export const MORNING_STAR_CHANCE: Readonly<Record<Cost, number>> = {
  1: 0.25,
  2: 0.22,
  3: 0.19,
  4: 0.16,
  5: 0.13,
};
export const LEVEL_ODDS: Readonly<Record<number, readonly [number, number, number, number, number]>> = {
  1: [100, 0, 0, 0, 0],
  2: [85, 15, 0, 0, 0],
  3: [70, 25, 5, 0, 0],
  4: [55, 35, 10, 0, 0],
  5: [45, 35, 18, 2, 0],
  6: [35, 35, 25, 5, 0],
  7: [25, 30, 35, 10, 0],
  8: [20, 30, 32, 17, 1],
  9: [20, 25, 27, 25, 3],
  10: [15, 25, 25, 29, 6],
  11: [15, 20, 20, 36, 9],
};

export const ANTI_BAD_LUCK_THRESHOLD: Readonly<Record<Cost, number>> = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 1,
};

export function banPrice(pieceTypeCount: number): number {
  return Math.floor(6 * Math.max(0, pieceTypeCount) ** 0.56);
}
