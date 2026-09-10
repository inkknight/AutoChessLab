import { describe, expect, it } from 'vitest';
import { LEVEL_ODDS } from '../src/data/rules';
import { AntiBadLuckState, drawCost, generateShop } from '../src/simulation/draw';
import { ChessPool } from '../src/simulation/pool';
import { SeededRng } from '../src/simulation/rng';
import type { ChessPiece } from '../src/simulation/types';

const pieces: ChessPiece[] = [
  { id: 'a', name: 'A', cost: 1, synergies: ['x'], sourceOrder: 0, copies: 2 },
  { id: 'b', name: 'B', cost: 1, synergies: ['y'], sourceOrder: 1, copies: 6 },
  { id: 'c', name: 'C', cost: 2, synergies: ['x'], sourceOrder: 2, copies: 20 },
];

describe('finite pool and draws', () => {
  it('uses the approved level odds and promotion mix', () => {
    expect(LEVEL_ODDS[8]).toEqual([20, 30, 32, 17, 1]);
    const normal = new SeededRng(88);
    const promoted = new SeededRng(88);
    const normalCosts = Array.from({ length: 20_000 }, () => drawCost(8, 'greed', normal));
    const promotedCosts = Array.from({ length: 20_000 }, () => drawCost(8, 'promotion', promoted));
    const normalFive = normalCosts.filter((cost) => cost === 5).length;
    const promotedFive = promotedCosts.filter((cost) => cost === 5).length;
    expect(normalFive / normalCosts.length).toBeCloseTo(0.01, 2);
    expect(promotedFive).toBeGreaterThan(normalFive * 1.5);
  });

  it('draws pieces weighted by remaining copies and conserves the pool', () => {
    let a = 0;
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const pool = new ChessPool(pieces);
      if (pool.draw(1, new SeededRng(seed), new Set()) === 'a') a += 1;
    }
    expect(a / 2_000).toBeCloseTo(0.25, 1);

    const pool = new ChessPool(pieces);
    const before = pool.total(1);
    const id = pool.draw(1, new SeededRng(1), new Set());
    expect(pool.total(1)).toBe(before - 1);
    pool.return(id!);
    expect(pool.total(1)).toBe(before);
  });

  it('rejects recent and synergy-banned candidates without removing them', () => {
    const pool = new ChessPool(pieces);
    const beforeA = pool.remaining('a');
    const beforeB = pool.remaining('b');
    expect(pool.draw(1, new SeededRng(1), new Set(['a']), 'y')).toBeNull();
    expect(pool.remaining('a')).toBe(beforeA);
    expect(pool.remaining('b')).toBe(beforeB);
  });

  it('returns unpurchased shop pieces and suppresses them in the next shop', () => {
    const roster = [
      { ...pieces[0], copies: 20 },
      { ...pieces[1], copies: 20 },
      { id: 'd', name: 'D', cost: 1 as const, synergies: [], sourceOrder: 3, copies: 20 },
    ];
    const pool = new ChessPool(roster);
    const first = generateShop({ pool, pieces: roster, level: 1, talent: 'greed', relic: 'none', useIo: false, bannedSynergy: null, rng: new SeededRng(3), size: 1 });
    const returned = first.items.map((item) => item.chessId);
    const totalWhileHeld = pool.total(1);
    const recent = first.returnUnpurchased();
    expect(recent).toEqual(returned);
    expect(pool.total(1)).toBe(totalWhileHeld + 1);
    const second = generateShop({ pool, pieces: roster, level: 1, talent: 'greed', relic: 'none', useIo: false, bannedSynergy: null, rng: new SeededRng(4), recent, size: 2 });
    expect(second.items.every((item) => !recent.includes(item.chessId))).toBe(true);
  });

  it('allows duplicate pieces within a new shop', () => {
    const only = [{ ...pieces[0], copies: 20 }];
    const shop = generateShop({ pool: new ChessPool(only), pieces: only, level: 1, talent: 'greed', relic: 'none', useIo: false, bannedSynergy: null, rng: new SeededRng(1) });
    expect(shop.items).toHaveLength(5);
    expect(shop.items.every((item) => item.chessId === 'a')).toBe(true);
  });

  it('forces the least-seen legal roster entry and applies the Lua reset condition', () => {
    const roster = [{ ...pieces[0], copies: 20 }, { ...pieces[1], copies: 20 }];
    const state = new AntiBadLuckState(roster);
    state.accepted('a', 1);
    state.accepted('a', 1);
    state.accepted('a', 1);
    state.accepted('b', 1);
    expect(state.select(1, new ChessPool(roster), new Set(), null)).toBe('b');
    expect(state.count('b', 1)).toBe(0);
  });

  it('applies remainder-seeker discount after pool removal at both boundaries', () => {
    const roster = [
      { ...pieces[0], copies: 10 },
      { ...pieces[1], copies: 13 },
    ];
    const shop = generateShop({ pool: new ChessPool(roster), pieces: roster, level: 1, talent: 'greed', relic: 'remainder-seeker', useIo: false, bannedSynergy: null, rng: new SeededRng(2), size: 1 });
    expect(shop.items[0].chessId).toBe('b');
    expect(shop.items[0].price).toBe(0);

    const directPool = new ChessPool([{ ...pieces[0], copies: 10 }, { ...pieces[1], copies: 10 }]);
    directPool.take('a');
    expect(directPool.remainderDiscount('a')).toBe(2);
    for (let i = 0; i < 7; i += 1) directPool.take('a');
    expect(directPool.remainderDiscount('a')).toBe(1);
  });
});
