import { useId, useMemo, useState } from 'react';
import type { ChessPiece, SimulationTarget } from '../simulation/types';

export interface PickerSynergy {
  id: string;
  name: string;
  kind: 'race' | 'class';
  pieceIds: readonly string[];
}

interface TargetPickerProps {
  pieces: readonly ChessPiece[];
  synergies: readonly PickerSynergy[];
  targets: readonly SimulationTarget[];
  disabled?: boolean;
  onChange: (targets: SimulationTarget[]) => void;
}

const normalQuickValues = [1, 3, 9];
const druidQuickValues = [1, 2, 4];

function PieceIcon({ piece }: { piece: ChessPiece }) {
  const [failed, setFailed] = useState(false);
  if (!piece.icon || failed) {
    return <span className={`piece-placeholder cost-${piece.cost}`} aria-hidden="true">{piece.name.slice(0, 1)}</span>;
  }
  return <img className="piece-icon" src={piece.icon} alt="" onError={() => setFailed(true)} />;
}

export function TargetPicker({ pieces, synergies, targets, disabled, onChange }: TargetPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [raceFilter, setRaceFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const targetIds = new Set(targets.map((target) => target.chessId));
  const synergyById = useMemo(() => new Map(synergies.map((synergy) => [synergy.id, synergy])), [synergies]);
  const raceOptions = useMemo(() => synergies.filter((synergy) => synergy.kind === 'race'), [synergies]);
  const classOptions = useMemo(() => synergies.filter((synergy) => synergy.kind === 'class'), [synergies]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return pieces
      .filter((piece) => !targetIds.has(piece.id))
      .filter((piece) => !raceFilter || piece.synergies.includes(raceFilter))
      .filter((piece) => !classFilter || piece.synergies.includes(classFilter))
      .filter((piece) => {
        if (!normalized) return true;
        const synergyNames = piece.synergies.map((id) => synergyById.get(id)?.name ?? id);
        return `${piece.name} ${piece.id} ${synergyNames.join(' ')}`.toLocaleLowerCase().includes(normalized);
      });
  }, [pieces, query, targets, raceFilter, classFilter, synergyById]);

  const togglePending = (piece: ChessPiece) => {
    setPendingIds((current) => current.includes(piece.id)
      ? current.filter((id) => id !== piece.id)
      : [...current, piece.id]);
  };

  const addPendingTargets = () => {
    if (pendingIds.length === 0) return;
    const pending = new Set(pendingIds);
    onChange([
      ...targets,
      ...pieces.filter((piece) => pending.has(piece.id)).map((piece) => ({ chessId: piece.id, copies: 1 })),
    ]);
    setPendingIds([]);
    setQuery('');
    setOpen(false);
  };

  return (
    <fieldset className="field-group target-picker" disabled={disabled}>
      <legend>目标阵容</legend>
      <p className="field-help">按中文名、内部 ID、种族或职业搜索，勾选后可批量加入。</p>
      <div className="picker-filters">
        <label>种族筛选
          <select value={raceFilter} onChange={(event) => { setRaceFilter(event.target.value); setOpen(true); }}>
            <option value="">全部种族</option>
            {raceOptions.map((synergy) => <option key={synergy.id} value={synergy.id}>{synergy.name}</option>)}
          </select>
        </label>
        <label>职业筛选
          <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setOpen(true); }}>
            <option value="">全部职业</option>
            {classOptions.map((synergy) => <option key={synergy.id} value={synergy.id}>{synergy.name}</option>)}
          </select>
        </label>
      </div>
      <div className="combobox-wrap">
        <label htmlFor={inputId}>搜索棋子</label>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="例如：斧王、兽人、战士"
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {open && (
          <div className="piece-options-popover">
            {matches.length > 0 ? (
              <ul id={`${inputId}-listbox`} className="piece-options" role="listbox" aria-multiselectable="true">
                {matches.map((piece) => {
                  const selected = pendingIds.includes(piece.id);
                  const labels = piece.synergies.map((id) => synergyById.get(id)?.name ?? id);
                  return (
                    <li key={piece.id}>
                      <button type="button" role="option" aria-selected={selected} onClick={() => togglePending(piece)}>
                        <span className={`picker-check ${selected ? 'is-selected' : ''}`} aria-hidden="true">{selected ? '✓' : ''}</span>
                        <PieceIcon piece={piece} />
                        <span><strong>{piece.name}</strong><small>{piece.id} · {piece.cost} 费 · {labels.join(' / ')}</small></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="picker-no-results">没有符合条件的棋子</p>}
            <div className="picker-actions">
              <span>已选 {pendingIds.length} 枚</span>
              <button type="button" disabled={pendingIds.length === 0} onClick={addPendingTargets}>添加已选棋子（{pendingIds.length}）</button>
            </div>
          </div>
        )}
      </div>

      {targets.length === 0 ? (
        <p className="empty-state">尚未添加目标棋子</p>
      ) : (
        <ul className="target-list" aria-label="已选目标棋子">
          {targets.map((target) => {
            const piece = pieces.find((candidate) => candidate.id === target.chessId);
            if (!piece) return null;
            return (
              <li className="target-card" key={target.chessId}>
                <PieceIcon piece={piece} />
                <div className="target-main">
                  <div className="target-heading">
                    <span><strong className="target-name">{piece.name}</strong><small>{piece.cost} 费 · {piece.synergies.join(' / ')}</small></span>
                    <button className="icon-button" type="button" aria-label={`移除${piece.name}`} onClick={() => onChange(targets.filter((item) => item.chessId !== target.chessId))}>×</button>
                  </div>
                  <label>
                    目标一星等价份数
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={target.copies}
                      aria-label="目标一星等价份数"
                      onChange={(event) => {
                        const copies = Math.max(1, Math.floor(Number(event.target.value) || 1));
                        onChange(targets.map((item) => item.chessId === target.chessId ? { ...item, copies } : item));
                      }}
                    />
                  </label>
                  <div className="quick-values" aria-label={`${piece.name}快捷份数`}>
                    {(piece.synergies.includes('is_druid') ? druidQuickValues : normalQuickValues).map((copies) => (
                      <button key={copies} type="button" aria-label={`设为 ${copies} 份`} aria-pressed={target.copies === copies} onClick={() => onChange(targets.map((item) => item.chessId === target.chessId ? { ...item, copies } : item))}>{copies} 份</button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
