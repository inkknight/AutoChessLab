import { describe, expect, it } from 'vitest';
import { levelUpgradeCost } from '../src/data/rules';

describe('levelUpgradeCost', () => {
  it.each([
    [1, 0],
    [5, 0],
    [6, 16],
    [7, 48],
    [8, 96],
    [9, 152],
    [10, 216],
    [11, 280],
  ])('charges the cumulative experience purchased from level 5 to level %i', (level, expected) => {
    expect(levelUpgradeCost(level)).toBe(expected);
  });
});
