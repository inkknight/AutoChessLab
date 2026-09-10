import { IO_PRICE } from '../data/rules';
import { Holdings } from './holdings';
import type { RandomSource } from './rng';
import type { Relic, ShopItem, Talent } from './types';

export interface PurchasePolicyOptions {
  relic: Relic;
  talent: Talent;
  useIo: boolean;
  rng: RandomSource;
}

export interface PurchaseShopResult {
  goldSpent: number;
  purchasedIndices: number[];
  ioPurchased: number;
  morningStarTriggers: number;
  completed: boolean;
}

export function purchaseShop(
  shop: readonly ShopItem[],
  holdings: Holdings,
  options: PurchasePolicyOptions,
): PurchaseShopResult {
  let goldSpent = 0;
  let ioPurchased = 0;
  let morningStarTriggers = 0;
  const purchasedIndices: number[] = [];

  for (let index = 0; index < shop.length; index += 1) {
    if (holdings.isComplete()) break;
    const item = shop[index];
    if (item.kind !== 'normal' || !holdings.isTarget(item.chessId) || holdings.isComplete(item.chessId)) continue;
    goldSpent += item.price;
    const result = holdings.purchaseNormal(
      item.chessId,
      item.cost as 1 | 2 | 3 | 4 | 5,
      options.relic === 'morning-star',
      options.rng,
      item.ownedAtGeneration,
    );
    if (result.morningStarTriggered) morningStarTriggers += 1;
    purchasedIndices.push(index);
  }

  if (options.useIo && !holdings.isComplete()) {
    for (let index = 0; index < shop.length && holdings.shouldBuyIo(); index += 1) {
      if (shop[index].kind !== 'io') continue;
      goldSpent += IO_PRICE;
      ioPurchased += 1;
      holdings.addIo(1);
      purchasedIndices.push(index);
    }
  }

  return { goldSpent, purchasedIndices, ioPurchased, morningStarTriggers, completed: holdings.isComplete() };
}
