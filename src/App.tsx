import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigPanel, type SynergyOption } from './components/ConfigPanel';
import { OptimizationSummary } from './components/OptimizationSummary';
import { ResultSummary } from './components/ResultSummary';
import { UsageGuideDrawer } from './components/UsageGuideDrawer';
import { resolvePublicAsset } from './data/asset-url';
import { gameData } from './data/game-data.generated';
import { banPrice as calculateBanPrice } from './data/rules';
import { useSimulationWorker } from './hooks/useSimulationWorker';
import { DEFAULT_OPTIMIZATION_LOCKS, type OptimizationChoice, type OptimizationLocks } from './simulation/optimizer';
import type { ChessPiece, SimulationConfig } from './simulation/types';

const STORAGE_KEY = 'autochess-simulator-config-v1';
const CONFIG_VERSION = 1;

const defaultLocks: OptimizationLocks = { ...DEFAULT_OPTIMIZATION_LOCKS };

const defaultConfig: SimulationConfig = {
  targets: [],
  level: 8,
  relic: 'none',
  talent: 'greed',
  useIo: false,
  bannedSynergy: null,
  trials: 10000,
  seed: 'autochess',
  maxActiveRerolls: 5000,
};

interface StoredState {
  version?: number;
  config?: Partial<SimulationConfig>;
  optimizationLocks?: Partial<OptimizationLocks>;
}

function readStoredState(): StoredState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as StoredState;
    return parsed.version === CONFIG_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function readConfig(): SimulationConfig {
  const parsed = readStoredState();
  if (!parsed?.config) return defaultConfig;
  return {
    ...defaultConfig,
    ...parsed.config,
    targets: Array.isArray(parsed.config.targets) ? parsed.config.targets : [],
  };
}

function readOptimizationLocks(): OptimizationLocks {
  const stored = readStoredState()?.optimizationLocks;
  if (!stored) return defaultLocks;
  return {
    level: stored.level === true,
    relic: stored.relic === true,
    talent: stored.talent === true,
    bannedSynergy: stored.bannedSynergy === true,
    useIo: stored.useIo === true,
  };
}

export default function App() {
  const [config, setConfig] = useState<SimulationConfig>(readConfig);
  const [optimizationLocks, setOptimizationLocks] = useState<OptimizationLocks>(readOptimizationLocks);
  const [guideOpen, setGuideOpen] = useState(false);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  const simulation = useSimulationWorker();

  const pieces = useMemo<ChessPiece[]>(() => gameData.pieces.map((piece) => ({
    id: piece.id,
    name: piece.name,
    cost: piece.cost,
    synergies: piece.synergies,
    sourceOrder: 'order' in piece ? piece.order : 0,
    copies: 'initialCopies' in piece ? piece.initialCopies : undefined,
    icon: resolvePublicAsset(piece.icon ?? undefined),
  })), []);

  const synergies = useMemo<SynergyOption[]>(() => gameData.synergies
    .filter((synergy) => synergy.id !== 'is_undead')
    .map((synergy) => ({
      id: synergy.id,
      name: synergy.name,
      kind: synergy.kind,
      pieceIds: pieces.filter((piece) => piece.synergies.includes(synergy.id)).map((piece) => piece.id),
    }))
    .filter((synergy) => synergy.pieceIds.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')), [pieces]);

  const selectedSynergy = synergies.find((synergy) => synergy.id === config.bannedSynergy) ?? null;
  const activeFiveCostIds = new Set([
    ...config.targets.map((target) => target.chessId),
    ...pieces.filter((piece) => piece.cost === 5).sort((a, b) => a.sourceOrder - b.sourceOrder).map((piece) => piece.id),
  ]);
  const affectedCount = selectedSynergy?.pieceIds.filter((id) => {
    const piece = pieces.find((candidate) => candidate.id === id);
    return piece?.cost !== 5 || Array.from(activeFiveCostIds).slice(0, 10).includes(id);
  }).length ?? 0;
  const conflict = selectedSynergy && config.targets.some((target) => selectedSynergy.pieceIds.includes(target.chessId)) ? selectedSynergy : null;

  useEffect(() => {
    if (conflict) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: CONFIG_VERSION, config, optimizationLocks }));
  }, [config, conflict, optimizationLocks]);

  const applyOptimizationChoice = (choice: OptimizationChoice) => {
    setConfig((current) => ({
      ...current,
      level: choice.level,
      relic: choice.relic,
      talent: choice.talent,
      bannedSynergy: choice.bannedSynergy,
      useIo: choice.useIo,
    }));
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">AC</span><span><strong>Auto Chess Lab</strong><small>阵容搜牌概率计算器</small></span></div>
        <button className="guide-trigger" type="button" onClick={() => setGuideOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-.9.6-1.5 1-1.5 2.2M12 17h.01" /></svg>
          使用说明
        </button>
      </header>

      <main>
        <div className="workspace-grid">
          <div className="config-column">
            <ConfigPanel
              config={config}
              pieces={pieces}
              synergies={synergies}
              running={simulation.status === 'running'}
              conflict={conflict}
              banPrice={calculateBanPrice(affectedCount)}
              optimizationLocks={optimizationLocks}
              onChange={setConfig}
              onLocksChange={setOptimizationLocks}
              onRun={() => simulation.run(config)}
              onOptimize={() => simulation.optimize(config, optimizationLocks)}
              onCancel={simulation.cancel}
            />
          </div>

          <div className="result-column" aria-live="polite">
            {simulation.status === 'running' && (
              <section className="running-panel panel" aria-labelledby="running-title">
                <span className="eyebrow">Worker 计算中</span>
                <h2 id="running-title">{simulation.mode === 'optimization'
                  ? simulation.optimizationPhase === 'refine'
                    ? '正在精算最佳配置'
                    : simulation.optimizationPhase === 'confirm'
                      ? '正在复核候选配置'
                      : '正在快速筛选配置'
                  : '正在模拟你的搜牌路径'}</h2>
                <div className="progress-line"><progress aria-label="模拟进度" value={simulation.progress} max="1" /><strong>{Math.round(simulation.progress * 100)}%</strong></div>
                <p>{simulation.mode === 'optimization'
                  ? `${simulation.completedConfigurations.toLocaleString()} / ${simulation.totalConfigurations.toLocaleString()} 个配置`
                  : `${simulation.completed.toLocaleString()} / ${simulation.total.toLocaleString()} 次。你可以随时取消，并保留当前配置。`}</p>
              </section>
            )}
            {simulation.status === 'cancelled' && <section className="notice-panel panel" role="status"><strong>模拟已取消</strong><p>配置未丢失，可以修改后重新运行。</p></section>}
            {simulation.status === 'error' && <section className="notice-panel error panel" role="alert"><strong>模拟失败</strong><p>{simulation.error}</p></section>}
            {simulation.optimizationResult ? (
              <OptimizationSummary result={simulation.optimizationResult} synergies={synergies} onApply={applyOptimizationChoice} />
            ) : simulation.result ? <ResultSummary result={simulation.result} /> : simulation.status !== 'running' && (
              <section className="result-placeholder panel" aria-label="结果预览">
                <span className="step-badge">02</span>
                <div className="placeholder-graphic" aria-hidden="true"><i /><i /><i /><i /><i /></div>
                <h2>结果将在这里展开</h2>
                <p>添加至少一枚目标棋子并开始模拟。结果会提供摘要、可交互分布图与完整数据表。</p>
              </section>
            )}
          </div>
        </div>
      </main>
      <footer><span>规则来源：反编译服务器脚本</span><span>本工具用于模型分析，不代表实战保证</span></footer>
      <UsageGuideDrawer open={guideOpen} onClose={closeGuide} />
    </div>
  );
}
