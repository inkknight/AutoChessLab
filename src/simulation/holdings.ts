import { MORNING_STAR_CHANCE } from '../data/rules';
import type { RandomSource } from './rng';
import type { Cost, SimulationTarget, Star } from './types';

interface Counts {
  1: number;
  2: number;
  3: number;
}

function emptyCounts(): Counts {
  return { 1: 0, 2: 0, 3: 0 };
}

export interface PurchaseResult {
  morningStarTriggered: boolean;
}

export class Holdings {
  private readonly countsById = new Map<string, Counts>();
  private readonly io = emptyCounts();
  private readonly targetCopies = new Map<string, number>();
  private readonly targetOrder = new Map<string, number>();
  private readonly costs: ReadonlyMap<string, number>;
  private readonly druidIds: ReadonlySet<string>;
  private ioAcquired = 0;
  private ioCapacity = 0;
  peakBenchSlots = 0;

  constructor(targets: readonly SimulationTarget[], costs: ReadonlyMap<string, number>, druidIds: ReadonlySet<string> = new Set()) {
    this.costs = costs;
    this.druidIds = druidIds;
    targets.forEach((target, index) => {
      this.targetCopies.set(target.chessId, target.copies);
      this.targetOrder.set(target.chessId, index);
      this.countsById.set(target.chessId, emptyCounts());
    });
    this.ioCapacity = targets.reduce((sum, target) => sum + Math.floor(target.copies / 3), 0);
  }

  count(id: string, star: Star): number {
    return this.countsById.get(id)?.[star] ?? 0;
  }

  ioCount(star: Star): number {
    return this.io[star];
  }

  progress(id: string): number {
    const counts = this.countsById.get(id);
    if (!counts) return 0;
    return this.druidIds.has(id)
      ? counts[1] + counts[2] * 2 + counts[3] * 4
      : counts[1] + counts[2] * 3 + counts[3] * 9;
  }

  remaining(id: string): number {
    return Math.max(0, (this.targetCopies.get(id) ?? 0) - this.progress(id));
  }

  isTarget(id: string): boolean {
    return this.targetCopies.has(id);
  }

  hasOwned(id: string): boolean {
    const counts = this.countsById.get(id);
    return Boolean(counts && counts[1] + counts[2] + counts[3] > 0);
  }

  ownedBaseIds(includeIo = true): Set<string> {
    const ids = new Set([...this.countsById.keys()].filter((id) => this.hasOwned(id)));
    if (includeIo && this.io[1] + this.io[2] + this.io[3] > 0) ids.add('chess_io');
    return ids;
  }

  isComplete(id?: string): boolean {
    if (id) return this.remaining(id) === 0;
    return [...this.targetCopies.keys()].every((targetId) => this.remaining(targetId) === 0);
  }

  benchSlots(): number {
    let slots = this.io[1] + this.io[2] + this.io[3];
    for (const counts of this.countsById.values()) slots += counts[1] + counts[2] + counts[3];
    return slots;
  }

  shouldBuyIo(): boolean {
    return !this.isComplete() && this.ioAcquired < this.ioCapacity;
  }

  canUseIoNow(): boolean {
    return ([1, 2] as const).some((star) => this.chooseIoTarget(star) !== null);
  }

  addNormal(id: string, star: Star, directCombine = true): void {
    const counts = this.countsById.get(id);
    if (!counts) return;
    if (star < 3 && directCombine && counts[star] >= this.combineThreshold(id, star as 1 | 2) - 1) {
      counts[star] -= this.combineThreshold(id, star as 1 | 2) - 1;
      counts[(star + 1) as Star] += 1;
      this.updatePeak();
      this.combineNormal(id, (star + 1) as Star);
    } else {
      counts[star] += 1;
      this.updatePeak();
      this.combineNormal(id, star);
    }
    this.applyIoWildcards();
  }

  purchaseNormal(id: string, cost: Cost, morningStar: boolean, rng: RandomSource, ownedAtGeneration = this.hasOwned(id)): PurchaseResult {
    if (!morningStar && this.count(id, 1) >= 2) {
      this.addNormal(id, 1, true);
      return { morningStarTriggered: false };
    }
    const triggered = morningStar && ownedAtGeneration && rng.chance(MORNING_STAR_CHANCE[cost]);
    this.addNormal(id, triggered ? 2 : 1, !triggered);
    return { morningStarTriggered: triggered };
  }

  addIo(star: Star): void {
    this.ioAcquired += 3 ** (star - 1);
    if (star < 3 && this.io[star] >= 2) {
      this.io[star] -= 2;
      this.io[(star + 1) as Star] += 1;
      this.updatePeak();
      this.combineIo((star + 1) as Star);
    } else {
      this.io[star] += 1;
      this.updatePeak();
      this.combineIo(star);
    }
    this.applyIoWildcards();
  }

  private combineNormal(id: string, star: Star): void {
    const counts = this.countsById.get(id)!;
    if (star >= 3) return;
    const threshold = this.combineThreshold(id, star as 1 | 2);
    if (counts[star] < threshold) return;
    counts[star] -= threshold;
    counts[(star + 1) as Star] += 1;
    this.combineNormal(id, (star + 1) as Star);
  }

  private combineThreshold(id: string, _star: 1 | 2): number {
    return this.druidIds.has(id) ? 2 : 3;
  }

  private combineIo(star: Star): void {
    if (star >= 3 || this.io[star] < 3) return;
    this.io[star] -= 3;
    this.io[(star + 1) as Star] += 1;
    this.combineIo((star + 1) as Star);
  }

  private chooseIoTarget(star: 1 | 2): string | null {
    const candidates = [...this.targetCopies.keys()].filter((id) => !this.isComplete(id) && this.count(id, star) >= 2);
    candidates.sort((a, b) =>
      (this.costs.get(b) ?? 0) - (this.costs.get(a) ?? 0)
      || this.remaining(b) - this.remaining(a)
      || (this.targetOrder.get(a) ?? 0) - (this.targetOrder.get(b) ?? 0),
    );
    return candidates[0] ?? null;
  }

  private applyIoWildcards(): void {
    for (const star of [1, 2] as const) {
      while (this.io[star] > 0) {
        const target = this.chooseIoTarget(star);
        if (!target) break;
        this.io[star] -= 1;
        const counts = this.countsById.get(target)!;
        counts[star] -= 2;
        counts[(star + 1) as Star] += 1;
        this.combineNormal(target, (star + 1) as Star);
      }
    }
  }

  private updatePeak(): void {
    this.peakBenchSlots = Math.max(this.peakBenchSlots, this.benchSlots());
  }
}
