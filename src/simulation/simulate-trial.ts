import { gameData } from '../data/game-data.generated';
import { banPrice, levelUpgradeCost, REROLL_COST } from '../data/rules';
import { AntiBadLuckState, generateShop } from './draw';
import { Holdings } from './holdings';
import { ChessPool } from './pool';
import { purchaseShop } from './purchase-policy';
import { settleWeightedDice } from './relics';
import { createTrialRng } from './rng';
import type { ChessPiece, SimulationConfig, TrialResult } from './types';

function toPiece(piece: (typeof gameData.pieces)[number]): ChessPiece {
  return {
    id: piece.id,
    name: piece.name,
    cost: piece.cost,
    synergies: piece.synergies,
    sourceOrder: piece.order,
    copies: piece.initialCopies,
    icon: piece.icon ?? undefined,
  };
}

export function activePiecesForConfig(config: SimulationConfig): ChessPiece[] {
  const all = gameData.pieces.map(toPiece);
  const targetIds = new Set(config.targets.map((target) => target.chessId));
  const requiredFive = all.filter((piece) => piece.cost === 5 && targetIds.has(piece.id));
  const activeFive = [...requiredFive];
  for (const piece of all) {
    if (piece.cost === 5 && activeFive.length < 10 && !targetIds.has(piece.id)) activeFive.push(piece);
  }
  return [...all.filter((piece) => piece.cost !== 5), ...activeFive].sort((a, b) => a.sourceOrder - b.sourceOrder);
}

function result(
  completed: boolean,
  activeRerolls: number,
  peakBenchSlots: number,
  purchases: number,
  ban: number,
  diceRefund: number,
  ioPurchased: number,
  morningStarTriggers: number,
  level: number,
  reason?: TrialResult['reason'],
): TrialResult {
  const leveling = levelUpgradeCost(level);
  const reroll = activeRerolls * REROLL_COST;
  return {
    completed,
    ...(reason ? { reason } : {}),
    netGold: leveling + reroll + purchases + ban - diceRefund,
    activeRerolls,
    peakBenchSlots,
    costs: { leveling, reroll, purchases, ban, diceRefund },
    ioPurchased,
    morningStarTriggers,
  };
}

export function simulateTrial(config: SimulationConfig, trialIndex: number): TrialResult {
  const pieces = activePiecesForConfig(config);
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const uniqueTargets = new Set(config.targets.map((target) => target.chessId));
  const invalid = config.level < 1 || config.level > 11
    || config.maxActiveRerolls < 0
    || config.targets.length === 0
    || uniqueTargets.size !== config.targets.length
    || config.targets.some((target) => !Number.isInteger(target.copies) || target.copies <= 0 || !pieceById.has(target.chessId))
    || config.targets.filter((target) => pieceById.get(target.chessId)?.cost === 5).length > 10;
  if (invalid) return result(false, 0, 0, 0, 0, 0, 0, 0, 5, 'invalid-config');

  const bannedIds = config.bannedSynergy
    ? pieces.filter((piece) => piece.synergies.includes(config.bannedSynergy!)).map((piece) => piece.id)
    : [];
  const banCost = config.bannedSynergy ? banPrice(bannedIds.length) : 0;
  if (config.targets.some((target) => bannedIds.includes(target.chessId))) {
    return result(false, 0, 0, 0, banCost, 0, 0, 0, config.level, 'impossible');
  }

  const rng = createTrialRng(config, trialIndex);
  const pool = new ChessPool(pieces);
  const costs = new Map(pieces.map((piece) => [piece.id, piece.cost]));
  const druidIds = new Set(pieces.filter((piece) => piece.synergies.includes('is_druid')).map((piece) => piece.id));
  const holdings = new Holdings(config.targets, costs, druidIds);
  const antiBadLuck = new AntiBadLuckState(pieces);
  let activeRerolls = 0;
  let purchases = 0;
  let diceRefund = 0;
  let ioPurchased = 0;
  let morningStarTriggers = 0;
  let weightedDiceStreak = 0;
  let recent: string[] = [];
  let firstShop = true;

  while (firstShop || activeRerolls < config.maxActiveRerolls) {
    if (!firstShop) activeRerolls += 1;
    const shop = generateShop({
      pool,
      pieces,
      level: config.level,
      talent: config.talent,
      relic: config.relic,
      useIo: config.useIo,
      bannedSynergy: config.bannedSynergy,
      rng,
      recent,
      antiBadLuck,
      hasOwned: (id) => holdings.hasOwned(id),
    });
    firstShop = false;
    if (shop.impossible) {
      shop.returnUnpurchased();
      return result(false, activeRerolls, holdings.peakBenchSlots, purchases, banCost, diceRefund, ioPurchased, morningStarTriggers, config.level, 'impossible');
    }

    if (config.relic === 'weighted-dice') {
      const dice = settleWeightedDice(shop.items, holdings.ownedBaseIds(), weightedDiceStreak, rng);
      diceRefund += dice.refund;
      weightedDiceStreak = dice.streak;
    }
    const purchased = purchaseShop(shop.items, holdings, {
      relic: config.relic,
      talent: config.talent,
      useIo: config.useIo,
      rng,
    });
    purchases += purchased.goldSpent;
    ioPurchased += purchased.ioPurchased;
    morningStarTriggers += purchased.morningStarTriggers;
    const purchasedIndices = new Set(purchased.purchasedIndices);
    if (purchased.completed) {
      shop.returnUnpurchased(purchasedIndices);
      return result(true, activeRerolls, holdings.peakBenchSlots, purchases, banCost, diceRefund, ioPurchased, morningStarTriggers, config.level);
    }
    recent = shop.returnUnpurchased(purchasedIndices);
  }

  return result(false, activeRerolls, holdings.peakBenchSlots, purchases, banCost, diceRefund, ioPurchased, morningStarTriggers, config.level, 'max-rerolls');
}
