import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "game-source");
const luaPath = path.join(sourceRoot, "scripts/vscripts/addon_game_mode.lua");
const unitsPath = path.join(sourceRoot, "scripts/npc/npc_units_custom.txt");
const localePath = path.join(sourceRoot, "resource/addon_schinese.txt");
const iconRoot = path.join(sourceRoot, "panorama/images/custom_game/chess_icon");
const outputPath = path.join(root, "src/data/game-data.generated.ts");
const publicIcons = path.join(root, "public/chess-icons");

const [lua, units, locale] = await Promise.all([
  readFile(luaPath, "utf8"),
  readFile(unitsPath, "utf8"),
  readFile(localePath, "utf8"),
]);

function extractBalancedBlock(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Cannot find ${marker}`);
  const open = text.indexOf("{", markerIndex);
  let depth = 0;
  let quoted = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  throw new Error(`Unclosed block for ${marker}`);
}

const rosterBlock = extractBalancedBlock(lua, "_G.chess_list_by_mana =");
const tierMatches = [...rosterBlock.matchAll(/\[(\d)]\s*=\s*\{([^}]*)\}/gs)];
if (tierMatches.length !== 5) throw new Error(`Expected five roster tiers, found ${tierMatches.length}`);

const roster = [];
const seen = new Set();
for (const match of tierMatches) {
  const cost = Number(match[1]);
  for (const idMatch of match[2].matchAll(/['"](chess_[a-z0-9_]+)['"]/g)) {
    const id = idMatch[1];
    if (seen.has(id)) throw new Error(`Duplicate roster piece ${id}`);
    seen.add(id);
    roster.push({ id, cost, order: roster.length });
  }
}

const synergyBlock = extractBalancedBlock(lua, "_G.chess_list_by_synergy =");
const synergyIds = [...synergyBlock.matchAll(/\b(is_[a-z0-9_]+)\s*=\s*\{/g)].map((match) => match[1]);
const synergySet = new Set(synergyIds);
const comboAbilityBlock = extractBalancedBlock(lua, "_G.combo_ability_type =");
const raceSynergies = new Set(
  [...comboAbilityBlock.matchAll(/^\s*(is_[a-z0-9_]+)\s*=\s*\{([^}]*)\}/gm)]
    .filter((match) => /\bis_race\s*=\s*true\b/.test(match[2]))
    .map((match) => match[1])
    .filter((id) => synergySet.has(id)),
);

function parseQuotedPairs(text) {
  const result = new Map();
  for (const match of text.matchAll(/^\s*"([^"]+)"\s+"([^"]*)"/gm)) {
    if (!result.has(match[1])) result.set(match[1], match[2]);
  }
  return result;
}

const localized = parseQuotedPairs(locale);

function unitBlock(id) {
  return extractBalancedBlock(units, `"${id}"`);
}

function property(block, key) {
  return block.match(new RegExp(`"${key}"\\s+"([^"]*)"`))?.[1] ?? "";
}

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(publicIcons, { recursive: true });

const missingIcons = [];
const pieces = [];
for (const entry of roster) {
  const block = unitBlock(entry.id);
  const level = Number(property(block, "Level"));
  if (!Number.isFinite(level)) throw new Error(`${entry.id} has no numeric Level`);
  if (level !== entry.cost) throw new Error(`${entry.id}: roster tier ${entry.cost} != KV Level ${level}`);

  const synergies = ["Ability1", "Ability2", "Ability3"]
    .map((key) => property(block, key))
    .filter((ability) => synergySet.has(ability));
  const sourceIcon = path.join(iconRoot, `${entry.id}_png.png`);
  const icon = `/chess-icons/${entry.id}.png`;
  const hasIcon = existsSync(sourceIcon);
  if (hasIcon) await copyFile(sourceIcon, path.join(publicIcons, `${entry.id}.png`));
  else missingIcons.push(entry.id);

  const rawName = localized.get(entry.id) || entry.id.replace(/^chess_/, "").toUpperCase();
  const initialCopies = ({ 1: 20, 2: 20, 3: 15, 4: 15, 5: 10 })[entry.cost];
  pieces.push({
    ...entry,
    sourceOrder: entry.order,
    name: rawName.replace(/[★☆]/g, "").trim(),
    synergies,
    icon: hasIcon ? icon : null,
    initialCopies,
    copies: initialCopies,
  });
}

const synergies = synergyIds.map((id) => ({
  id,
  name: localized.get(`DOTA_Tooltip_ability_${id}`) || id.replace(/^is_/, ""),
  kind: raceSynergies.has(id) ? "race" : "class",
  pieceIds: pieces.filter((piece) => piece.synergies.includes(id)).map((piece) => piece.id),
}));

const odds = [
  [100, 0, 0, 0, 0], [85, 15, 0, 0, 0], [70, 25, 5, 0, 0],
  [55, 35, 10, 0, 0], [45, 35, 18, 2, 0], [35, 35, 25, 5, 0],
  [25, 30, 35, 10, 0], [20, 30, 32, 17, 1], [20, 25, 27, 25, 3],
  [15, 25, 25, 29, 6], [15, 20, 20, 36, 9],
];
for (const [index, row] of odds.entries()) {
  if (row.reduce((sum, value) => sum + value, 0) !== 100) throw new Error(`Level ${index + 1} odds do not total 100`);
}

const output = `// Generated by scripts/extract-game-data.mjs. Do not edit by hand.\n\nexport type ChessCost = 1 | 2 | 3 | 4 | 5;\n\nexport interface PieceData {\n  id: string;\n  name: string;\n  cost: ChessCost;\n  order: number;\n  sourceOrder: number;\n  synergies: string[];\n  icon: string | null;\n  initialCopies: number;\n  copies: number;\n}\n\nexport interface SynergyData {\n  id: string;\n  name: string;\n  kind: \"race\" | \"class\";\n  pieceIds: string[];\n}\n\nexport interface GameData {\n  pieces: PieceData[];\n  synergies: SynergyData[];\n  io: { id: \"chess_io\"; name: string; cost: 5; icon: string | null };\n}\n\nexport const gameData: GameData = ${JSON.stringify({
  pieces,
  synergies,
  io: {
    id: "chess_io",
    name: (localized.get("chess_io") || "精灵守卫").replace(/[★☆]/g, "").trim(),
    cost: 5,
    icon: existsSync(path.join(iconRoot, "chess_io_png.png")) ? "/chess-icons/chess_io.png" : null,
  },
}, null, 2)};\n`;

if (existsSync(path.join(iconRoot, "chess_io_png.png"))) {
  await copyFile(path.join(iconRoot, "chess_io_png.png"), path.join(publicIcons, "chess_io.png"));
}
await writeFile(outputPath, output, "utf8");
console.log(`Generated ${pieces.length} pieces and ${synergies.length} synergies.`);
console.log(`Missing icons (${missingIcons.length}): ${missingIcons.join(", ") || "none"}`);
