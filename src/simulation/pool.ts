import { DEFAULT_COPIES_BY_COST } from '../data/rules';
import type { RandomSource } from './rng';
import type { ChessPiece, Cost } from './types';

export class ChessPool {
  private readonly pieceById = new Map<string, ChessPiece>();
  private readonly orderedByCost = new Map<Cost, string[]>();
  private readonly counts = new Map<string, number>();

  constructor(pieces: readonly ChessPiece[]) {
    for (const piece of [...pieces].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
      if (this.pieceById.has(piece.id)) throw new Error(`duplicate chess id: ${piece.id}`);
      this.pieceById.set(piece.id, piece);
      this.counts.set(piece.id, piece.copies ?? DEFAULT_COPIES_BY_COST[piece.cost]);
      const ids = this.orderedByCost.get(piece.cost) ?? [];
      ids.push(piece.id);
      this.orderedByCost.set(piece.cost, ids);
    }
  }

  piece(id: string): ChessPiece | undefined {
    return this.pieceById.get(id);
  }

  ids(cost: Cost): readonly string[] {
    return this.orderedByCost.get(cost) ?? [];
  }

  remaining(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  total(cost?: Cost): number {
    if (cost) return this.ids(cost).reduce((sum, id) => sum + this.remaining(id), 0);
    return [...this.counts.values()].reduce((sum, count) => sum + count, 0);
  }

  take(id: string): boolean {
    const count = this.remaining(id);
    if (count <= 0) return false;
    this.counts.set(id, count - 1);
    return true;
  }

  return(id: string): void {
    if (this.pieceById.has(id)) this.counts.set(id, this.remaining(id) + 1);
  }

  eligible(cost: Cost, recent: ReadonlySet<string>, bannedSynergy?: string | null): string[] {
    return this.ids(cost).filter((id) => {
      const piece = this.pieceById.get(id)!;
      return this.remaining(id) > 0 && !recent.has(id) && (!bannedSynergy || !piece.synergies.includes(bannedSynergy));
    });
  }

  draw(cost: Cost, rng: RandomSource, recent: ReadonlySet<string>, bannedSynergy?: string | null): string | null {
    const eligible = this.eligible(cost, recent, bannedSynergy);
    const total = eligible.reduce((sum, id) => sum + this.remaining(id), 0);
    if (total <= 0) return null;
    let cursor = rng.int(1, total);
    for (const id of eligible) {
      cursor -= this.remaining(id);
      if (cursor <= 0) {
        this.take(id);
        return id;
      }
    }
    return null;
  }

  remainderDiscount(id: string): 0 | 1 | 2 {
    const piece = this.pieceById.get(id);
    if (!piece) return 0;
    const max = Math.max(0, ...this.ids(piece.cost).map((candidate) => this.remaining(candidate)));
    const difference = max - this.remaining(id);
    if (difference <= 2) return 2;
    if (difference <= 8) return 1;
    return 0;
  }
}
