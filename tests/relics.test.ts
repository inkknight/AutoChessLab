import { describe, expect, it } from 'vitest';
import { settleWeightedDice } from '../src/simulation/relics';
import type { RandomSource } from '../src/simulation/rng';
import type { ShopItem } from '../src/simulation/types';

const shop = (ids: string[]): ShopItem[] => ids.map((chessId) => ({ kind: 'normal', chessId, cost: 1, basePrice: 1, price: 1 }));
const rng = (value: number): RandomSource => ({ next: () => value, nextUint32: () => Math.floor(value * 0x1_0000_0000), int: (min) => min, chance: (probability) => value < probability });

describe('weighted dice', () => {
  it('refunds one gold on the free initial shop with empty holdings', () => {
    expect(settleWeightedDice(shop(['a']), new Set(), 0, rng(0.99))).toEqual({ refund: 1, streak: 1 });
  });

  it('resets the miss streak when the shop contains an owned base piece', () => {
    expect(settleWeightedDice(shop(['a', 'b']), new Set(['b']), 8, rng(0.99))).toEqual({ refund: 0, streak: 0 });
  });

  it('uses min(1, 5/n) chance for one gold and otherwise refunds two', () => {
    expect(settleWeightedDice(shop(['a']), new Set(['x']), 5, rng(0.9))).toEqual({ refund: 2, streak: 6 });
    expect(settleWeightedDice(shop(['a']), new Set(['x']), 5, rng(0.2))).toEqual({ refund: 1, streak: 6 });
  });
});
