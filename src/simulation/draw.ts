import {
  ANTI_BAD_LUCK_THRESHOLD,
  IO_CHANCE,
  IO_PRICE,
  LEVEL_ODDS,
  PROMOTION_CHANCE,
  SHOP_SIZE,
  SSR_FIRST_ROLL_CHANCE,
  SSR_SECOND_ROLL_CHANCE,
} from '../data/rules';
import { ChessPool } from './pool';
import type { RandomSource } from './rng';
import type { ChessPiece, Cost, Relic, ShopItem, Talent } from './types';

export function drawCost(level: number, talent: Talent, rng: RandomSource): Cost {
  let drawLevel = Math.min(11, Math.max(1, Math.trunc(level)));
  if (talent === 'promotion' && rng.chance(PROMOTION_CHANCE)) drawLevel = Math.min(11, drawLevel + 1);
  const roll = rng.next() * 100;
  let cumulative = 0;
  const odds = LEVEL_ODDS[drawLevel];
  for (let index = 0; index < odds.length; index += 1) {
    cumulative += odds[index];
    if (roll < cumulative) return (index + 1) as Cost;
  }
  return 5;
}

export class AntiBadLuckState {
  private readonly counts = new Map<Cost, Map<string, number>>();

  constructor(pieces: readonly ChessPiece[]) {
    for (const piece of pieces) {
      const row = this.counts.get(piece.cost) ?? new Map<string, number>();
      row.set(piece.id, 0);
      this.counts.set(piece.cost, row);
    }
  }

  count(id: string, cost: Cost): number {
    return this.counts.get(cost)?.get(id) ?? 0;
  }

  select(cost: Cost, pool: ChessPool, recent: ReadonlySet<string>, bannedSynergy: string | null): string | null {
    const row = this.counts.get(cost);
    if (!row || row.size === 0) return null;
    const values = [...row.values()];
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (average <= ANTI_BAD_LUCK_THRESHOLD[cost]) return null;
    let selected: string | null = null;
    let least = Number.POSITIVE_INFINITY;
    for (const id of pool.ids(cost)) {
      const piece = pool.piece(id)!;
      const value = row.get(id) ?? 0;
      if (value < least && pool.remaining(id) > 0 && !recent.has(id) && (!bannedSynergy || !piece.synergies.includes(bannedSynergy))) {
        selected = id;
        least = value;
      }
    }
    if (!selected) return null;
    row.set(selected, (row.get(selected) ?? 0) + 1);
    const zeroCount = [...row.values()].filter((value) => value === 0).length;
    if (zeroCount <= 1) for (const id of row.keys()) row.set(id, 0);
    return selected;
  }

  accepted(id: string, cost: Cost): void {
    const row = this.counts.get(cost);
    if (row?.has(id)) row.set(id, row.get(id)! + 1);
  }
}

export interface GenerateShopOptions {
  pool: ChessPool;
  pieces: readonly ChessPiece[];
  level: number;
  talent: Talent;
  relic: Relic;
  useIo: boolean;
  bannedSynergy: string | null;
  rng: RandomSource;
  recent?: readonly string[];
  size?: number;
  antiBadLuck?: AntiBadLuckState;
  hasOwned?: (chessId: string) => boolean;
  maxAttemptsPerSlot?: number;
}

export interface GeneratedShop {
  items: ShopItem[];
  impossible: boolean;
  returnUnpurchased(purchasedIndices?: ReadonlySet<number>): string[];
}

export function generateShop(options: GenerateShopOptions): GeneratedShop {
  const {
    pool,
    level,
    talent,
    relic,
    bannedSynergy,
    rng,
    antiBadLuck = new AntiBadLuckState(options.pieces),
    hasOwned = () => false,
    maxAttemptsPerSlot = 200,
  } = options;
  const size = options.size ?? SHOP_SIZE;
  const recent = new Set(options.recent ?? []);
  const items: ShopItem[] = [];

  for (let slot = 0; slot < size; slot += 1) {
    let accepted = false;
    for (let attempt = 0; attempt < maxAttemptsPerSlot && !accepted; attempt += 1) {
      const specialAllowed = relic !== 'remainder-seeker';
      const firstSpecialRoll = rng.int(1, Math.round(1 / SSR_FIRST_ROLL_CHANCE));
      const secondSpecialRoll = rng.int(1, Math.round(1 / SSR_SECOND_ROLL_CHANCE));
      if (specialAllowed && level >= 7 && firstSpecialRoll === 1 && secondSpecialRoll === 1) {
        items.push({ kind: 'ssr', chessId: 'ssr-placeholder', cost: 0, basePrice: 0, price: 0 });
        accepted = true;
        continue;
      }
      if (specialAllowed && firstSpecialRoll <= IO_CHANCE / SSR_FIRST_ROLL_CHANCE) {
        items.push({ kind: 'io', chessId: 'chess_io', cost: IO_PRICE, basePrice: IO_PRICE, price: IO_PRICE });
        accepted = true;
        continue;
      }

      const cost = drawCost(level, talent, rng);
      let id = antiBadLuck.select(cost, pool, recent, bannedSynergy);
      const forced = id !== null;
      if (id) {
        if (!pool.take(id)) id = null;
      } else {
        id = pool.draw(cost, rng, recent, bannedSynergy);
      }
      if (!id) continue;
      if (!forced) antiBadLuck.accepted(id, cost);
      const basePrice = pool.piece(id)!.cost;
      const compassDiscount = relic === 'remainder-seeker' ? pool.remainderDiscount(id) : 0;
      const ownedAtGeneration = hasOwned(id);
      const greedDiscount = talent === 'greed' && ownedAtGeneration ? 1 : 0;
      items.push({
        kind: 'normal',
        chessId: id,
        cost: basePrice,
        basePrice,
        price: Math.max(0, basePrice - compassDiscount - greedDiscount),
        ownedAtGeneration,
      });
      accepted = true;
    }
    if (!accepted) break;
  }

  return {
    items,
    impossible: items.length < size,
    returnUnpurchased(purchasedIndices = new Set<number>()): string[] {
      const returned: string[] = [];
      items.forEach((item, index) => {
        if (item.kind === 'normal' && !purchasedIndices.has(index)) {
          pool.return(item.chessId);
          returned.push(item.chessId);
        }
      });
      items.splice(0, items.length);
      return returned;
    },
  };
}
