# Optimal Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible three-stage successive-halving Monte Carlo optimizer that ranks the cheapest reliable level/talent/Ban/IO configurations for the selected lineup and lets the user apply a result.

**Architecture:** A pure `optimizer.ts` module owns candidate enumeration, phase seed derivation, sample combination, reliability filtering, and deterministic ranking. The existing Web Worker orchestrates screen, confirmation, and refinement trials by reusing `simulateTrial()` and `aggregateResults()`, while the hook and React components expose optimization as a second operation without replacing ordinary simulation results.

> **2026-09-10 performance and relic amendment:** The implementation now follows the updated design spec: levels 5–10 and all four relics, with all legal candidates × 50 screen trials using a four-point completion tolerance, up to 100 candidates × 200 additional confirmation trials (combined to 250) using the standard one-point tolerance, up to 12 finalists × the selected full trial count, then five displayed rankings. The original task-by-task snippets below document the first two-stage implementation and are superseded wherever they conflict with this amendment or the linked spec.

**Tech Stack:** TypeScript, React, Vite, Web Worker, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-09-09-optimal-configuration-design.md`

## Global Constraints

- Optimize level 5–10, all four relics (`none`, `weighted-dice`, `morning-star`, `remainder-seeker`), `greed`/`promotion`, legal Ban/no Ban, and IO false/true.
- Screen every legal candidate with exactly 50 trials and a four-point completion tolerance; retain at most 100.
- Add 200 confirmation trials to each retained candidate and rank their combined 250 samples with the standard one-point completion tolerance; retain at most 12.
- Refine at most 12 confirmed winners with the selected full trial count and return at most 5 final rankings.
- Rank completed samples by mean net gold with the approved completion-rate protection.
- Reuse the existing simulation engine; do not duplicate draw, pool, purchase, combination, relic, or aggregation rules.
- Preserve deterministic results for the same lineup, relic, seed, trial count, and reroll cap.
- Follow TDD: each production behavior must be preceded by a test that fails for the expected missing behavior.
- The project is not a Git repository, so commit steps are intentionally omitted; do not initialize Git or create commits.

## File Structure

- Create `src/simulation/optimizer.ts`: candidate types, enumeration, phase configs, reliability filtering, and stable ranking.
- Create `tests/optimizer.test.ts`: pure optimizer contract tests.
- Modify `src/workers/protocol.ts`: optimization request, progress, and result message contracts.
- Modify `src/workers/simulation.worker.ts`: cancellable two-stage orchestration.
- Modify `src/hooks/useSimulationWorker.ts`: task mode, optimization state, and `optimize()` entry point.
- Create `src/components/OptimizationSummary.tsx`: recommended configuration and runner-up table.
- Modify `src/components/ConfigPanel.tsx`: second action and mode-aware cancellation.
- Modify `src/App.tsx`: invoke optimization, render progress/result, and apply a ranked configuration.
- Modify `src/styles.css`: action layout, optimization cards/table, warning, and narrow viewport behavior.
- Modify `tests/app.test.tsx`: protocol/UI/application behavior.
- Modify `e2e/simulator.spec.ts`: browser optimizer flow.
- Modify `README.md`: optimization scope, ranking, and two-stage sampling.

---

### Task 1: Pure Candidate Enumeration and Phase Configuration

**Files:**
- Create: `src/simulation/optimizer.ts`
- Create: `tests/optimizer.test.ts`

**Interfaces:**
- Consumes: `SimulationConfig`, `ChessPiece`, `Talent`, `AggregateResult` from `src/simulation/types.ts`.
- Produces:
  - `OptimizationChoice { level: number; talent: Talent; bannedSynergy: string | null; useIo: boolean }`
  - `OptimizationSynergy { id: string; pieceIds: readonly string[] }`
  - `enumerateOptimizationChoices(base, pieces, synergies): OptimizationChoice[]`
  - `coarseTrialCount(finalTrials): number`
  - `buildPhaseConfig(base, choice, phase, trials): SimulationConfig`

- [ ] **Step 1: Write failing enumeration tests**

Create `tests/optimizer.test.ts` with focused fixtures and these assertions:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildPhaseConfig,
  coarseTrialCount,
  enumerateOptimizationChoices,
} from '../src/simulation/optimizer';
import type { ChessPiece, SimulationConfig } from '../src/simulation/types';

const base: SimulationConfig = {
  targets: [{ chessId: 'target', copies: 3 }],
  level: 8,
  relic: 'morning-star',
  talent: 'greed',
  useIo: false,
  bannedSynergy: null,
  trials: 10_000,
  seed: 'optimizer-seed',
  maxActiveRerolls: 5000,
};
const pieces: ChessPiece[] = [
  { id: 'target', name: '目标', cost: 2, synergies: ['is_target'], sourceOrder: 0 },
  { id: 'other', name: '其他', cost: 2, synergies: ['is_useful'], sourceOrder: 1 },
];

it('enumerates every level, talent, legal effective Ban, and IO choice', () => {
  const choices = enumerateOptimizationChoices(base, pieces, [
    { id: 'is_target', pieceIds: ['target'] },
    { id: 'is_useful', pieceIds: ['other'] },
    { id: 'is_empty', pieceIds: ['inactive'] },
  ]);
  expect(choices).toHaveLength(11 * 2 * 2 * 2);
  expect(choices.some((choice) => choice.bannedSynergy === 'is_target')).toBe(false);
  expect(choices.some((choice) => choice.bannedSynergy === 'is_empty')).toBe(false);
  expect(choices[0]).toEqual({ level: 1, talent: 'greed', bannedSynergy: null, useIo: false });
});

it('uses the approved coarse sample sizes', () => {
  expect(coarseTrialCount(10_000)).toBe(500);
  expect(coarseTrialCount(50_000)).toBe(1000);
  expect(coarseTrialCount(100_000)).toBe(1000);
});

it('keeps fixed inputs and derives a phase-specific deterministic seed', () => {
  const choice = { level: 6, talent: 'promotion' as const, bannedSynergy: 'is_useful', useIo: true };
  const coarse = buildPhaseConfig(base, choice, 'coarse', 500);
  const refine = buildPhaseConfig(base, choice, 'refine', 10_000);
  expect(coarse).toMatchObject({
    targets: base.targets,
    relic: 'morning-star',
    level: 6,
    talent: 'promotion',
    bannedSynergy: 'is_useful',
    useIo: true,
    maxActiveRerolls: 5000,
    trials: 500,
  });
  expect(coarse.seed).toBe('optimizer-seed::optimize::coarse');
  expect(refine.seed).toBe('optimizer-seed::optimize::refine');
});
```

- [ ] **Step 2: Run the test and verify the expected RED state**

Run: `npm test -- --run tests/optimizer.test.ts`

Expected: FAIL because `src/simulation/optimizer.ts` does not exist.

- [ ] **Step 3: Implement the minimal enumeration API**

Create `src/simulation/optimizer.ts` with exported interfaces, `coarseTrialCount()`, `buildPhaseConfig()`, and deterministic nested loops. Compute active IDs from the supplied `pieces`; retain `null` plus only synergies that intersect active IDs and do not intersect target IDs. Loop in this exact stable order: level ascending, talents `['greed', 'promotion']`, Ban choices `[null, ...legal IDs sorted lexically]`, IO `[false, true]`.

```ts
export function coarseTrialCount(finalTrials: number): number {
  return finalTrials <= 10_000 ? 500 : 1000;
}

export function buildPhaseConfig(
  base: SimulationConfig,
  choice: OptimizationChoice,
  phase: 'coarse' | 'refine',
  trials: number,
): SimulationConfig {
  return {
    ...base,
    ...choice,
    trials,
    seed: `${base.seed}::optimize::${phase}`,
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run tests/optimizer.test.ts`

Expected: all three tests PASS.

### Task 2: Reliability-Protected Ranking

**Files:**
- Modify: `src/simulation/optimizer.ts`
- Modify: `tests/optimizer.test.ts`

**Interfaces:**
- Produces:
  - `OptimizationEntry { choice: OptimizationChoice; aggregate: AggregateResult }`
  - `RankedOptimizationEntry extends OptimizationEntry { rank: number; extraMeanGold: number }`
  - `rankOptimizationEntries(entries, limit): { entries: RankedOptimizationEntry[]; reliabilityWarning: boolean }`

- [ ] **Step 1: Add failing ranking tests**

Add an `aggregate()` fixture that supplies `completionRate`, `netGold.mean/p50/p90`, and `activeRerolls.mean`, then test these behaviors separately:

```ts
it('filters candidates more than one point below a reliable best completion rate', () => {
  const ranked = rankOptimizationEntries([
    entry(choice(5), aggregate(0.995, 60)),
    entry(choice(6), aggregate(0.98, 20)),
    entry(choice(7), aggregate(0.99, 50)),
  ], 5);
  expect(ranked.reliabilityWarning).toBe(false);
  expect(ranked.entries.map((item) => item.choice.level)).toEqual([7, 5]);
});

it('prioritizes completion rate when no candidate reaches 95 percent', () => {
  const ranked = rankOptimizationEntries([
    entry(choice(5), aggregate(0.80, 20)),
    entry(choice(6), aggregate(0.90, 40)),
  ], 5);
  expect(ranked.reliabilityWarning).toBe(true);
  expect(ranked.entries[0].choice.level).toBe(6);
});

it('excludes entries without completed samples and assigns stable deltas', () => {
  const ranked = rankOptimizationEntries([
    entry(choice(8), aggregate(1, 42)),
    entry(choice(7), aggregate(1, 40)),
    entry(choice(6), aggregate(0, null)),
  ], 2);
  expect(ranked.entries.map((item) => [item.rank, item.choice.level, item.extraMeanGold])).toEqual([
    [1, 7, 0],
    [2, 8, 2],
  ]);
});
```

The fixture must create real `AggregateResult` values rather than mock a ranking function.

- [ ] **Step 2: Verify the ranking tests fail for missing exports**

Run: `npm test -- --run tests/optimizer.test.ts`

Expected: FAIL because `rankOptimizationEntries` and ranking types are not implemented.

- [ ] **Step 3: Implement ranking with exact stable keys**

Implement:

1. Remove entries with `completedTrials === 0` or `netGold === null`.
2. Find `maxCompletionRate`.
3. If `maxCompletionRate >= 0.95`, retain entries with `completionRate >= maxCompletionRate - 0.01` and compare mean gold first.
4. Otherwise compare completion rate descending before mean gold.
5. Apply tie-breaks in order: mean gold, P50, P90, active reroll mean, level, talent (`greed` before `promotion`), Ban (`null` before lexical IDs), IO (`false` before `true`).
6. Slice to `limit`, number ranks from 1, and calculate `extraMeanGold` relative to rank 1.

Use a small epsilon (`1e-12`) when applying the 1-point completion threshold so values such as `0.99` are not dropped by floating-point subtraction from `1.0`.

- [ ] **Step 4: Verify all optimizer tests pass**

Run: `npm test -- --run tests/optimizer.test.ts`

Expected: all optimizer tests PASS.

### Task 3: Extend the Worker Protocol and Run Two-Stage Optimization

**Files:**
- Modify: `src/workers/protocol.ts`
- Modify: `src/workers/simulation.worker.ts`
- Modify: `src/simulation/optimizer.ts`
- Create: `tests/optimization-protocol.test.ts`

**Interfaces:**
- Produces in `protocol.ts`:
  - `OptimizationPhase = 'coarse' | 'refine'`
  - `OptimizationResult { version; requestedTrials; coarseTrials; candidateCount; finalistCount; reliabilityWarning; rankings }`
  - `WorkerRequest` variant `{ type: 'optimize'; requestId; config }`
  - `WorkerResponse` variants `optimization-progress` and `optimization-complete`.
- Produces in `optimizer.ts`:
  - `OptimizationProgress` callback payload.
  - `runOptimization(config, options): Promise<OptimizationResult without version>` where options inject `isCancelled`, `onProgress`, `yieldControl`, and `batchSize`.

- [ ] **Step 1: Write failing protocol and orchestration tests**

Create `tests/optimization-protocol.test.ts`. Test the pure async `runOptimization()` with injected trial and aggregation functions so the test remains fast while exercising real phase orchestration:

```ts
it('coarse-screens 12 candidates, refines them, and returns five rankings', async () => {
  const progress: Array<{ phase: string; completedConfigurations: number }> = [];
  const result = await runOptimization(base, pieces, synergies, {
    simulate: (config, trialIndex) => syntheticTrial(config, trialIndex),
    aggregate: (trials, level) => aggregateResults(trials, level),
    isCancelled: () => false,
    onProgress: (value) => progress.push(value),
    yieldControl: async () => {},
    batchSize: 100,
  });
  expect(result.candidateCount).toBeGreaterThan(12);
  expect(result.finalistCount).toBe(12);
  expect(result.rankings).toHaveLength(5);
  expect(progress.some((item) => item.phase === 'coarse')).toBe(true);
  expect(progress.some((item) => item.phase === 'refine')).toBe(true);
});

it('stops without publishing rankings when cancellation is observed', async () => {
  let calls = 0;
  await expect(runOptimization(base, pieces, synergies, {
    simulate: () => { calls += 1; return completedTrial(10); },
    aggregate: aggregateResults,
    isCancelled: () => calls >= 100,
    onProgress: () => {},
    yieldControl: async () => {},
    batchSize: 50,
  })).rejects.toMatchObject({ name: 'OptimizationCancelledError' });
});
```

Also add compile-time-shaped assertions that an `optimize` request and both response variants satisfy `WorkerRequest`/`WorkerResponse`.

- [ ] **Step 2: Run the protocol test and verify RED**

Run: `npm test -- --run tests/optimization-protocol.test.ts`

Expected: FAIL because optimization protocol variants and `runOptimization()` are absent.

- [ ] **Step 3: Implement injected two-stage orchestration**

Move orchestration into `optimizer.ts` so it can be tested without loading a browser Worker. The function must:

- derive active pieces through an injected or imported active-piece provider;
- enumerate candidates;
- process each candidate in `batchSize` chunks;
- check cancellation before each chunk and after each yield;
- aggregate coarse trials and rank to 12;
- rebuild finalists with `phase='refine'` and `base.trials`;
- aggregate and rank to 5;
- report phase-local `completedTrials/totalTrials` plus `completedConfigurations/totalConfigurations`;
- throw `OptimizationCancelledError` rather than return partial data.

Keep trial indexes zero-based within each candidate. Different choices remain deterministic because `createTrialRng()` hashes the full phase config and choice.

- [ ] **Step 4: Add Worker message handling**

In `simulation.worker.ts`, replace the single `runSimulation()` entry with mode-aware dispatch:

```ts
if (message.type === 'optimize') {
  void runOptimizationRequest(message.requestId, message.config);
} else {
  void runSimulation(message.requestId, message.config);
}
```

`runOptimizationRequest()` calls the pure orchestrator, posts `optimization-progress`, converts the result to protocol version 1, and posts `optimization-complete`. If cancellation is observed, post the existing `cancelled` response exactly once. Preserve new-request-cancels-old-request behavior.

- [ ] **Step 5: Run focused and existing simulation tests**

Run: `npm test -- --run tests/optimizer.test.ts tests/optimization-protocol.test.ts tests/simulate-trial.test.ts tests/aggregate.test.ts`

Expected: all selected tests PASS.

### Task 4: Expose Optimization Through the Worker Hook

**Files:**
- Modify: `src/hooks/useSimulationWorker.ts`
- Modify: `tests/app.test.tsx`

**Interfaces:**
- Produces from `useSimulationWorker()`:
  - `mode: 'simulation' | 'optimization' | null`
  - `optimizationPhase: OptimizationPhase | null`
  - `completedConfigurations`, `totalConfigurations`
  - `optimizationResult: OptimizationResult | null`
  - `optimize(config): void`
  - existing `run(config)` and `cancel()`.

- [ ] **Step 1: Add a failing UI-level Worker request test**

In `tests/app.test.tsx`, add a target and click “计算最优配置”. Assert the last operation request is:

```ts
expect(optimizeMessage).toMatchObject({
  type: 'optimize',
  config: {
    targets: [{ chessId: 'chess_axe', copies: 1 }],
    relic: 'none',
    trials: 10_000,
    seed: 'autochess',
  },
});
```

Emit:

```ts
{
  type: 'optimization-progress',
  requestId,
  phase: 'coarse',
  completedTrials: 500,
  totalTrials: 1000,
  completedConfigurations: 1,
  totalConfigurations: 2,
}
```

Assert the page shows “正在粗筛配置”, “1 / 2 个配置”, and “50%”.

- [ ] **Step 2: Run the focused app test and verify RED**

Run: `npm test -- --run tests/app.test.tsx -t "sends an optimization request"`

Expected: FAIL because the button, hook API, and optimization progress UI do not exist.

- [ ] **Step 3: Implement mode-aware hook state**

Extend state without changing request ID isolation. `run()` sets mode `simulation`; `optimize()` sets mode `optimization`. Handle `optimization-progress` separately, and on `optimization-complete` store `optimizationResult` while preserving the latest ordinary `result`. Beginning an ordinary run may clear the visible optimization result, and beginning optimization may clear the visible ordinary result, but the hook fields remain separately typed.

Use the same `cancel` message. On cancellation retain the active mode long enough for `App` to render a generic cancelled notice, then reset it on the next operation.

- [ ] **Step 4: Run the focused app test**

Run: `npm test -- --run tests/app.test.tsx -t "sends an optimization request"`

Expected: the hook portion compiles; the test may still fail only on missing UI text/button, which Task 5 supplies. If it fails earlier, correct the hook contract before proceeding.

### Task 5: Add the Second Action, Progress Panel, and Ranked Results

**Files:**
- Create: `src/components/OptimizationSummary.tsx`
- Modify: `src/components/ConfigPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/app.test.tsx`

**Interfaces:**
- `OptimizationSummary` props:

```ts
interface OptimizationSummaryProps {
  result: OptimizationResult;
  synergies: readonly SynergyOption[];
  onApply: (choice: OptimizationChoice) => void;
}
```

- `ConfigPanel` adds `runningMode`, `onOptimize`; `running` remains derivable as `runningMode !== null`.
- Applying a choice updates only `level`, `talent`, `bannedSynergy`, and `useIo`.

- [ ] **Step 1: Finish the failing action/progress test**

Update the test started in Task 4 to assert both idle buttons exist and are enabled for a valid lineup. During optimization assert both are replaced by “取消模拟”, controls are disabled, and the coarse progress labels are visible.

- [ ] **Step 2: Add a failing ranked-result/application test**

Add an `optimizationResult` fixture containing two rankings with full aggregate summaries. Emit `optimization-complete`, then assert:

```ts
expect(await screen.findByRole('heading', { name: '最优配置' })).toBeInTheDocument();
expect(screen.getByText('推荐配置')).toBeInTheDocument();
expect(screen.getByRole('table', { name: '次优配置' })).toBeInTheDocument();
expect(screen.getByText('+2.4 金')).toBeInTheDocument();
```

Click rank 1’s “应用此配置”, then assert level, talent, Ban, and IO changed while relic, seed, trials, targets, and reroll cap retained their original values.

- [ ] **Step 3: Run both tests and verify RED**

Run: `npm test -- --run tests/app.test.tsx -t "optimization"`

Expected: FAIL because optimization controls and summary are absent.

- [ ] **Step 4: Implement mode-aware actions and progress**

In `ConfigPanel`, render two buttons in an `.action-buttons` grid:

```tsx
<button className="button primary" type="button" onClick={onRun} disabled={invalid}>开始模拟</button>
<button className="button secondary" type="button" onClick={onOptimize} disabled={invalid}>计算最优配置</button>
```

During either operation render one cancel button. In `App`, render mode-specific progress copy:

- simulation: existing “正在模拟你的搜牌路径”;
- optimization coarse: “正在粗筛配置”;
- optimization refine: “正在精算候选配置”.

For optimization, show configuration progress and phase-local trial progress.

- [ ] **Step 5: Implement `OptimizationSummary`**

Render an empty-result state when `rankings.length === 0`. Otherwise render rank 1 as a recommendation card and ranks 2–5 in an accessible table. Resolve Ban labels through `synergies`; format null as“不 Ban”, talent labels as“贪婪/扬升”, and IO as“使用/不使用”. If `reliabilityWarning` is true, render a warning with `role="status"` explaining that no configuration reached 95% completion.

Every ranking has a uniquely named button: `应用第 1 名配置`, `应用第 2 名配置`, etc. The recommendation shows the non-negative difference between rank 2 and rank 1 when rank 2 exists.

- [ ] **Step 6: Implement apply behavior in App**

```ts
const applyOptimizationChoice = (choice: OptimizationChoice) => {
  setConfig((current) => ({
    ...current,
    level: choice.level,
    talent: choice.talent,
    bannedSynergy: choice.bannedSynergy,
    useIo: choice.useIo,
  }));
};
```

Do not copy trials, seed, relic, targets, or max rerolls from any result.

- [ ] **Step 7: Add responsive styles**

Add focused classes for `.action-buttons`, `.optimization-hero`, `.optimization-choice`, `.optimization-metrics`, `.optimization-warning`, and `.optimization-table`. At `max-width: 520px`, stack action buttons and allow the result table to scroll horizontally inside an explicit wrapper; do not change unrelated page styles.

- [ ] **Step 8: Run all component tests**

Run: `npm test -- --run tests/app.test.tsx`

Expected: all app tests PASS, including existing simulation request, cancellation, persistence, picker, and chart tests.

### Task 6: Browser Flow and Documentation

**Files:**
- Modify: `e2e/simulator.spec.ts`
- Modify: `README.md`

**Interfaces:**
- No new production interfaces.

- [ ] **Step 1: Add an optimizer Playwright scenario**

Add a browser test that:

1. Adds one inexpensive target with one copy so optimization remains bounded.
2. Sets final trials to 10,000 and a dedicated seed.
3. Clicks “计算最优配置”.
4. Waits up to 180 seconds for heading “最优配置”.
5. Asserts the recommendation, mean net gold, completion rate, and runner-up table are visible.
6. Clicks “应用第 1 名配置”.
7. Reads the recommended level/talent/Ban/IO shown in the result and verifies the matching controls changed.
8. Takes a full-page screenshot and asserts its byte length exceeds 10,000.

- [ ] **Step 2: Run the new E2E test and verify behavior**

Run: `npm run test:e2e -- --grep "calculates and applies an optimal configuration"`

Expected: PASS. If runtime exceeds 180 seconds, optimize batching/yield overhead without reducing the approved trial counts or candidate dimensions.

- [ ] **Step 3: Document optimizer semantics**

Add a README section named `## 最优配置计算` that states:

- relic and lineup stay fixed;
- searched dimensions are level, 15-round talent, legal Ban/no Ban, and IO;
- 10,000 final trials use 500 coarse trials; larger presets use 1,000;
- at most 12 finalists are fully simulated and 5 displayed;
- mean net gold is the primary cost metric after completion-rate protection;
- applying a result changes only the four searched fields.

- [ ] **Step 4: Run the complete unit/component suite**

Run: `npm test -- --run`

Expected: all Vitest files PASS with zero failures.

### Task 7: Full Verification and Real-App Smoke

**Files:**
- Modify only if verification exposes a reproducible defect, and add a failing regression test before each fix.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run the repository verification command**

Run: `npm run verify`

Expected sequence: data extraction succeeds, TypeScript passes, all Vitest tests pass, production build succeeds, and all Playwright tests pass.

- [ ] **Step 2: Launch the production build as the actual app**

Run in background: `npx vite preview --host 127.0.0.1 --port 4173`

Wait until `http://127.0.0.1:4173` responds before opening the browser.

- [ ] **Step 3: Drive a fixed smoke scenario**

Using Playwright or Chromium against the preview server:

- select one target;
- use 10,000 final trials and seed `optimizer-production-smoke`;
- run optimization;
- record recommended level/talent/Ban/IO and mean net gold;
- apply it;
- verify the four controls match and the console contains no errors;
- set viewport to 390×844 and verify no horizontal document overflow.

- [ ] **Step 4: Report exact evidence**

Report test file/test counts, build outcome, E2E count, production smoke recommendation, runtime, and console error count. If any command fails, report the failure output instead of claiming completion.
