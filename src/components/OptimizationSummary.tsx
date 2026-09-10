import type { OptimizationChoice } from '../simulation/optimizer';
import type { OptimizationResult } from '../workers/protocol';
import type { SynergyOption } from './ConfigPanel';

interface OptimizationSummaryProps {
  result: OptimizationResult;
  synergies: readonly SynergyOption[];
  onApply: (choice: OptimizationChoice) => void;
}

function number(value: number, digits = 1) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
}

function choiceLabel(choice: OptimizationChoice, synergies: readonly SynergyOption[]) {
  const relicNames = {
    none: '无圣物',
    'weighted-dice': '加重骰子',
    'morning-star': '启明星',
    'remainder-seeker': '寻幽罗盘',
  } as const;
  const ban = choice.bannedSynergy
    ? synergies.find((synergy) => synergy.id === choice.bannedSynergy)?.name ?? choice.bannedSynergy
    : '不 Ban';
  return `${choice.level} 级 · ${relicNames[choice.relic]} · ${choice.talent === 'greed' ? '贪婪' : '扬升'} · ${ban} · ${choice.useIo ? '使用 IO' : '不使用 IO'}`;
}

export function OptimizationSummary({ result, synergies, onApply }: OptimizationSummaryProps) {
  const [best, ...runnersUp] = result.rankings;
  if (!best || !best.aggregate.netGold || !best.aggregate.activeRerolls || !best.aggregate.peakBenchSlots) {
    return (
      <section className="results panel" aria-labelledby="optimization-heading">
        <div className="panel-heading"><div><span className="eyebrow">优化完成</span><h2 id="optimization-heading">最优配置</h2></div><span className="step-badge">02</span></div>
        <div className="empty-results" role="status"><strong>没有可排名的完成样本</strong><p>请提高单局最大主动刷新，或检查目标是否能在当前规则下完成。</p></div>
      </section>
    );
  }

  return (
    <section className="results optimization-results panel" aria-labelledby="optimization-heading">
      <div className="panel-heading">
        <div><span className="eyebrow">逐次减半优化完成 · {result.candidateCount} 个配置</span><h2 id="optimization-heading">最优配置</h2></div>
        <span className="step-badge">02</span>
      </div>

      {result.reliabilityWarning && <p className="optimization-warning" role="status">没有配置达到 95% 完成率；当前排名优先考虑完成率，结果可能受最大刷新上限影响。</p>}

      <article className="optimization-hero">
        <div className="optimization-choice">
          <span>推荐配置</span>
          <strong>{choiceLabel(best.choice, synergies)}</strong>
          <button className="button primary" type="button" onClick={() => onApply(best.choice)}>应用第 1 名配置</button>
        </div>
        <dl className="optimization-metrics">
          <div><dt>平均净金币</dt><dd>{number(best.aggregate.netGold.mean)}</dd></div>
          <div><dt>P50 / P90</dt><dd>{number(best.aggregate.netGold.p50, 0)} / {number(best.aggregate.netGold.p90, 0)}</dd></div>
          <div><dt>完成率</dt><dd>{(best.aggregate.completionRate * 100).toFixed(1)}%</dd></div>
          <div><dt>平均主动刷新</dt><dd>{number(best.aggregate.activeRerolls.mean)}</dd></div>
          <div><dt>平均峰值占用</dt><dd>{number(best.aggregate.peakBenchSlots.mean)}</dd></div>
          <div><dt>相对第二名节省</dt><dd>{runnersUp[0] ? `${number(runnersUp[0].extraMeanGold)} 金` : '—'}</dd></div>
        </dl>
      </article>

      {runnersUp.length > 0 && (
        <div className="optimization-table-wrap">
          <table className="optimization-table" aria-label="次优配置">
            <thead><tr><th>排名</th><th>配置</th><th>平均净金币</th><th>比最优多</th><th>P50 / P90</th><th>完成率</th><th>平均刷新</th><th>操作</th></tr></thead>
            <tbody>{runnersUp.map((entry) => {
              const gold = entry.aggregate.netGold;
              const rerolls = entry.aggregate.activeRerolls;
              return (
                <tr key={entry.rank}>
                  <td>#{entry.rank}</td>
                  <td>{choiceLabel(entry.choice, synergies)}</td>
                  <td>{gold ? number(gold.mean) : '—'}</td>
                  <td>+{number(entry.extraMeanGold)} 金</td>
                  <td>{gold ? `${number(gold.p50, 0)} / ${number(gold.p90, 0)}` : '—'}</td>
                  <td>{(entry.aggregate.completionRate * 100).toFixed(1)}%</td>
                  <td>{rerolls ? number(rerolls.mean) : '—'}</td>
                  <td><button className="button secondary" type="button" onClick={() => onApply(entry.choice)}>应用第 {entry.rank} 名配置</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
