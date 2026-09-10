import type { ChessPiece, Relic, SimulationConfig, Talent } from '../simulation/types';
import { TargetPicker } from './TargetPicker';

export interface SynergyOption {
  id: string;
  name: string;
  kind: 'race' | 'class';
  pieceIds: readonly string[];
}

interface ConfigPanelProps {
  config: SimulationConfig;
  pieces: readonly ChessPiece[];
  synergies: readonly SynergyOption[];
  running: boolean;
  conflict: SynergyOption | null;
  banPrice: number;
  onChange: (config: SimulationConfig) => void;
  onRun: () => void;
  onOptimize: () => void;
  onCancel: () => void;
}

const relics: Array<{ value: Relic; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'weighted-dice', label: '加重骰子' },
  { value: 'morning-star', label: '启明星' },
  { value: 'remainder-seeker', label: '寻幽罗盘' },
];

function update<K extends keyof SimulationConfig>(config: SimulationConfig, key: K, value: SimulationConfig[K]) {
  return { ...config, [key]: value };
}

export function ConfigPanel({ config, pieces, synergies, running, conflict, banPrice, onChange, onRun, onOptimize, onCancel }: ConfigPanelProps) {
  const selectedSynergy = synergies.find((synergy) => synergy.id === config.bannedSynergy);
  const affectedPieces = selectedSynergy
    ? pieces.filter((piece) => selectedSynergy.pieceIds.includes(piece.id))
    : [];

  return (
    <form className="config-panel panel" onSubmit={(event) => { event.preventDefault(); onRun(); }}>
      <div className="panel-heading">
        <div><span className="eyebrow">模拟配置</span><h2>构建你的搜牌场景</h2></div>
        <span className="step-badge">01</span>
      </div>

      <TargetPicker pieces={pieces} synergies={synergies} targets={config.targets} disabled={running} onChange={(targets) => onChange(update(config, 'targets', targets))} />

      <fieldset className="field-group two-column-fields" disabled={running}>
        <legend>对局条件</legend>
        <label>玩家等级
          <select value={config.level} onChange={(event) => onChange(update(config, 'level', Number(event.target.value)))}>
            {Array.from({ length: 11 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>{level} 级</option>)}
          </select>
        </label>
        <label>搜牌圣物
          <select value={config.relic} onChange={(event) => onChange(update(config, 'relic', event.target.value as Relic))}>
            {relics.map((relic) => <option key={relic.value} value={relic.value}>{relic.label}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset className="field-group" disabled={running}>
        <legend>15 回合天赋</legend>
        <div className="segmented-control">
          {([
            ['greed', '贪婪', '已拥有的金币商品 −1 金'],
            ['promotion', '扬升', '每个普通槽位 50% 使用高一级概率'],
          ] as Array<[Talent, string, string]>).map(([value, label, description]) => (
            <label key={value}>
              <input type="radio" name="talent" value={value} checked={config.talent === value} onChange={() => onChange(update(config, 'talent', value))} />
              <span><strong>{label}</strong><small>{description}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field-group" disabled={running}>
        <legend>额外规则</legend>
        <label className="switch-row">
          <span><strong>使用精灵球</strong><small>精灵守卫 / IO，以源码 0.2% 概率出现</small></span>
          <input type="checkbox" checked={config.useIo} onChange={(event) => onChange(update(config, 'useIo', event.target.checked))} />
        </label>
        <label>羁绊 Ban
          <select value={config.bannedSynergy ?? ''} onChange={(event) => onChange(update(config, 'bannedSynergy', event.target.value || null))}>
            <option value="">不 Ban</option>
            {synergies.map((synergy) => <option key={synergy.id} value={synergy.id}>{synergy.name}</option>)}
          </select>
        </label>
        {selectedSynergy && (
          <div className={`ban-detail ${conflict ? 'is-error' : ''}`}>
            <strong>{selectedSynergy.name} · {affectedPieces.length} 种 · {banPrice} 金</strong>
            <span>{affectedPieces.map((piece) => piece.name).join('、') || '当前活跃池无关联棋子'}</span>
          </div>
        )}
        {conflict && <p className="form-error" role="alert">目标冲突：{conflict.name} Ban 会屏蔽已选目标，请先调整配置。</p>}
      </fieldset>

      <fieldset className="field-group two-column-fields" disabled={running}>
        <legend>Monte Carlo</legend>
        <label>模拟次数
          <select value={config.trials} onChange={(event) => onChange(update(config, 'trials', Number(event.target.value)))}>
            {[10000, 50000, 100000].map((count) => <option key={count} value={count}>{count.toLocaleString()} 次</option>)}
          </select>
        </label>
        <label>随机种子
          <input value={config.seed} onChange={(event) => onChange(update(config, 'seed', event.target.value))} />
        </label>
        <label className="full-row">单局最大主动刷新
          <input type="number" min="1" step="100" value={config.maxActiveRerolls} onChange={(event) => onChange(update(config, 'maxActiveRerolls', Math.max(1, Math.floor(Number(event.target.value) || 1))))} />
        </label>
      </fieldset>

      <div className="action-bar">
        {running ? (
          <button className="button secondary" type="button" onClick={onCancel}>取消模拟</button>
        ) : (
          <div className="action-buttons">
            <button className="button primary" type="button" onClick={onRun} disabled={config.targets.length === 0 || Boolean(conflict)}>开始模拟</button>
            <button className="button secondary" type="button" onClick={onOptimize} disabled={config.targets.length === 0 || Boolean(conflict)}>计算最优配置</button>
          </div>
        )}
        <p>相同配置与 seed 可完全复现</p>
      </div>
    </form>
  );
}
