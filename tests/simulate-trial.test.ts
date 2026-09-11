import { describe, expect, it } from 'vitest';
import { banPrice } from '../src/data/rules';
import { simulateTrial } from '../src/simulation/simulate-trial';
import type { SimulationConfig } from '../src/simulation/types';

const base: SimulationConfig = {
  targets: [{ chessId: 'chess_bane', copies: 1 }],
  level: 8,
  relic: 'none',
  talent: 'greed',
  useIo: false,
  bannedSynergy: null,
  trials: 10,
  seed: 'fixed',
  maxActiveRerolls: 500,
};

describe('simulateTrial', () => {
  it('is exactly reproducible for config and trial index', () => {
    expect(simulateTrial(base, 9)).toEqual(simulateTrial({ ...base, trials: 1000 }, 9));
  });

  it('includes cumulative level-up spending in the net gold accounting formula', () => {
    const result = simulateTrial({ ...base, level: 7, relic: 'weighted-dice' }, 2);
    expect(result.costs.leveling).toBe(48);
    expect(result.netGold).toBe(result.costs.leveling + result.costs.reroll + result.costs.purchases + result.costs.ban - result.costs.diceRefund);
    expect(result.costs.reroll).toBe(result.activeRerolls * 2);
  });

  it('does not charge level-up spending at the level-five baseline', () => {
    const result = simulateTrial({ ...base, level: 5 }, 2);
    expect(result.costs.leveling).toBe(0);
  });

  it('stops at the active reroll guard', () => {
    const result = simulateTrial({ ...base, targets: [{ chessId: 'chess_bane', copies: 1000 }], maxActiveRerolls: 1 }, 1);
    expect(result.completed).toBe(false);
    expect(result.reason).toBe('max-rerolls');
    expect(result.activeRerolls).toBe(1);
  });

  it('rejects a target that intersects the selected synergy ban', () => {
    const result = simulateTrial({ ...base, bannedSynergy: 'is_satyr' }, 1);
    expect(result.completed).toBe(false);
    expect(result.reason).toBe('impossible');
    expect(result.costs.ban).toBe(banPrice(2));
  });

  it('accounts for the weighted-dice refund on the free first shop', () => {
    const result = simulateTrial({ ...base, targets: [{ chessId: 'chess_au', copies: 1 }], level: 1, relic: 'weighted-dice', maxActiveRerolls: 0 }, 0);
    expect(result.costs.diceRefund).toBe(1);
  });

  it('completes a four-copy druid target after purchasing four copies', () => {
    const result = simulateTrial({ ...base, targets: [{ chessId: 'chess_fur', copies: 4 }], level: 6, talent: 'promotion' }, 3);
    expect(result.completed).toBe(true);
    expect(result.costs.purchases).toBe(8);
  });
});
