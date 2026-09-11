import { describe, expect, it } from 'vitest';
import { resolvePublicAsset } from '../src/data/asset-url';

describe('resolvePublicAsset', () => {
  it('places root-relative public assets beneath the configured Vite base path', () => {
    expect(resolvePublicAsset('/chess-icons/chess_axe.png', '/AutoChessLab/'))
      .toBe('/AutoChessLab/chess-icons/chess_axe.png');
  });

  it('leaves missing and external assets unchanged', () => {
    expect(resolvePublicAsset(undefined, '/AutoChessLab/')).toBeUndefined();
    expect(resolvePublicAsset('https://example.com/icon.png', '/AutoChessLab/'))
      .toBe('https://example.com/icon.png');
  });
});
