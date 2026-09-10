import { describe, expect, it } from 'vitest';
import { Holdings } from '../src/simulation/holdings';
import { purchaseShop } from '../src/simulation/purchase-policy';
import type { RandomSource } from '../src/simulation/rng';
import type { ShopItem } from '../src/simulation/types';

const always: RandomSource = { next: () => 0, nextUint32: () => 0, int: (min) => min, chance: (p) => p > 0 };
const never: RandomSource = { next: () => 0.999999, nextUint32: () => 0xffffffff, int: (_min, max) => max, chance: () => false };

describe('holdings and purchases', () => {
  it('tracks equivalent progress separately from physical bench entities', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 9 }], new Map([['a', 1]]));
    holdings.addNormal('a', 1);
    holdings.addNormal('a', 1);
    holdings.addNormal('a', 1);
    expect(holdings.count('a', 1)).toBe(0);
    expect(holdings.count('a', 2)).toBe(1);
    expect(holdings.progress('a')).toBe(3);
    expect(holdings.benchSlots()).toBe(1);
    expect(holdings.peakBenchSlots).toBe(2);
  });

  it('direct auto-combine does not invent a temporary third slot', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 3 }], new Map([['a', 1]]));
    holdings.addNormal('a', 1);
    holdings.addNormal('a', 1);
    expect(holdings.peakBenchSlots).toBe(2);
    holdings.addNormal('a', 1);
    expect(holdings.benchSlots()).toBe(1);
    expect(holdings.peakBenchSlots).toBe(2);
  });

  it('keeps only physical entities after recursive normal combinations', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 9 }], new Map([['a', 1]]));
    for (let copy = 0; copy < 9; copy += 1) holdings.addNormal('a', 1);
    expect(holdings.count('a', 3)).toBe(1);
    expect(holdings.benchSlots()).toBe(1);
    expect(holdings.peakBenchSlots).toBe(4);
  });

  it('combines one-star druids in pairs', () => {
    const holdings = new Holdings(
      [{ chessId: 'druid', copies: 2 }],
      new Map([['druid', 2]]),
      new Set(['druid']),
    );
    holdings.addNormal('druid', 1);
    holdings.addNormal('druid', 1);
    expect(holdings.count('druid', 2)).toBe(1);
    expect(holdings.progress('druid')).toBe(2);
    expect(holdings.benchSlots()).toBe(1);
  });

  it('combines four one-star-equivalent druid copies into one three-star entity', () => {
    const holdings = new Holdings(
      [{ chessId: 'druid', copies: 4 }],
      new Map([['druid', 2]]),
      new Set(['druid']),
    );
    for (let copy = 0; copy < 4; copy += 1) holdings.addNormal('druid', 1);
    expect(holdings.count('druid', 3)).toBe(1);
    expect(holdings.progress('druid')).toBe(4);
    expect(holdings.benchSlots()).toBe(1);
    expect(holdings.peakBenchSlots).toBe(2);
  });

  it('locks greed prices to the pre-shop ownership snapshot', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 3 }], new Map([['a', 2]]));
    const shop: ShopItem[] = [
      { kind: 'normal', chessId: 'a', cost: 2, basePrice: 2, price: 2 },
      { kind: 'normal', chessId: 'a', cost: 2, basePrice: 2, price: 2 },
    ];
    const result = purchaseShop(shop, holdings, { relic: 'none', talent: 'greed', useIo: false, rng: never });
    expect(result.goldSpent).toBe(4);
  });

  it('does not make a later same-shop copy eligible for morning star', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 6 }], new Map([['a', 1]]));
    const shop: ShopItem[] = [
      { kind: 'normal', chessId: 'a', cost: 1, basePrice: 1, price: 1, ownedAtGeneration: false },
      { kind: 'normal', chessId: 'a', cost: 1, basePrice: 1, price: 1, ownedAtGeneration: false },
    ];
    const result = purchaseShop(shop, holdings, { relic: 'morning-star', talent: 'promotion', useIo: false, rng: always });
    expect(result.morningStarTriggers).toBe(0);
    expect(holdings.progress('a')).toBe(2);
  });

  it('buys targets before an earlier IO slot', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 3 }], new Map([['a', 1]]));
    const shop: ShopItem[] = [
      { kind: 'io', chessId: 'chess_io', cost: 5, basePrice: 5, price: 5 },
      { kind: 'normal', chessId: 'a', cost: 1, basePrice: 1, price: 1 },
      { kind: 'normal', chessId: 'a', cost: 1, basePrice: 1, price: 1 },
    ];
    const result = purchaseShop(shop, holdings, { relic: 'none', talent: 'promotion', useIo: true, rng: never });
    expect(result.purchasedIndices).toEqual([1, 2, 0]);
    expect(result.completed).toBe(true);
  });

  it('checks auto-combine before morning star', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 6 }], new Map([['a', 1]]));
    holdings.addNormal('a', 1);
    holdings.addNormal('a', 1);
    const result = holdings.purchaseNormal('a', 1, true, always);
    expect(result.morningStarTriggered).toBe(false);
    expect(holdings.progress('a')).toBe(3);
  });

  it('morning star grants a two-star entity but removes one pool copy', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 3 }], new Map([['a', 1]]));
    holdings.addNormal('a', 1);
    const result = holdings.purchaseNormal('a', 1, true, always);
    expect(result.morningStarTriggered).toBe(true);
    expect(holdings.progress('a')).toBe(4);
    expect(holdings.benchSlots()).toBe(2);
  });

  it('can retain a useful IO before its matching target pair appears', () => {
    const holdings = new Holdings([{ chessId: 'a', copies: 3 }], new Map([['a', 1]]));
    expect(holdings.shouldBuyIo()).toBe(true);
    holdings.addIo(1);
    expect(holdings.ioCount(1)).toBe(1);
    expect(holdings.shouldBuyIo()).toBe(false);
    holdings.addNormal('a', 1);
    holdings.addNormal('a', 1);
    expect(holdings.progress('a')).toBe(3);
    expect(holdings.ioCount(1)).toBe(0);
  });

  it('uses at most one same-star IO with two target entities', () => {
    const holdings = new Holdings([{ chessId: 'low', copies: 9 }, { chessId: 'high', copies: 9 }], new Map([['low', 1], ['high', 5]]));
    holdings.addNormal('low', 1);
    holdings.addNormal('low', 1);
    holdings.addNormal('high', 1);
    holdings.addNormal('high', 1);
    holdings.addIo(1);
    expect(holdings.count('high', 2)).toBe(1);
    expect(holdings.count('low', 1)).toBe(2);
    expect(holdings.ioCount(1)).toBe(0);
  });
});
