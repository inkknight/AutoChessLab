import { describe, expect, it } from "vitest";
import { gameData } from "../src/data/game-data.generated";

describe("source-derived game data", () => {
  it("contains a unique, tier-consistent regular roster", () => {
    expect(gameData.pieces.length).toBe(98);
    expect(new Set(gameData.pieces.map((piece) => piece.id)).size).toBe(gameData.pieces.length);
    expect(gameData.pieces.filter((piece) => piece.cost === 5)).toHaveLength(19);
  });

  it("extracts known names, costs and synergies", () => {
    const tusk = gameData.pieces.find((piece) => piece.id === "chess_tusk");
    expect(tusk).toMatchObject({ name: "巨牙海民", cost: 1 });
    expect(tusk?.synergies).toEqual(expect.arrayContaining(["is_beast", "is_warrior"]));
    expect(gameData.io).toMatchObject({ id: "chess_io", cost: 5 });
  });

  it("classifies synergies as races or classes from source metadata", () => {
    expect(gameData.synergies.find((synergy) => synergy.id === "is_orc")).toMatchObject({
      name: "兽人",
      kind: "race",
    });
    expect(gameData.synergies.find((synergy) => synergy.id === "is_warrior")).toMatchObject({
      name: "战士",
      kind: "class",
    });
  });

  it("uses the documented default finite-pool copies", () => {
    const expected = { 1: 20, 2: 20, 3: 15, 4: 15, 5: 10 } as const;
    for (const piece of gameData.pieces) expect(piece.initialCopies).toBe(expected[piece.cost]);
  });
});
