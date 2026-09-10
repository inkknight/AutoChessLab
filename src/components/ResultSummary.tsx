import type { MetricSummary } from '../simulation/types';
import type { SimulationResult } from '../workers/protocol';
import { DistributionChart } from './DistributionChart';

function number(value: number, digits = 1) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function percentileDetail(metric: MetricSummary) {
  return `P50 ${number(metric.p50, 0)} · P90 ${number(metric.p90, 0)} · P95 ${number(metric.p95, 0)}`;
}

export function ResultSummary({ result }: { result: SimulationResult }) {
  if (!result.netGold || !result.activeRerolls || !result.peakBenchSlots) {
    return (
      <section className="results panel" aria-labelledby="results-heading">
        <div className="panel-heading"><div><span className="eyebrow">运行完成</span><h2 id="results-heading">模拟结果</h2></div><span className="step-badge">02</span></div>
        <div className="empty-results" role="status"><strong>没有完成样本</strong><p>请提高单局最大主动刷新，或检查目标是否能在当前规则下完成。</p></div>
      </section>
    );
  }

  return (
    <section className="results panel" aria-labelledby="results-heading">
      <div className="panel-heading">
        <div><span className="eyebrow">运行完成 · {result.requestedTrials.toLocaleString()} 次</span><h2 id="results-heading">模拟结果</h2></div>
        <span className="step-badge">02</span>
      </div>
      <div className="summary-grid">
        <SummaryCard label="平均净金币" value={number(result.netGold.mean)} detail={percentileDetail(result.netGold)} />
        <SummaryCard label="平均主动刷新" value={number(result.activeRerolls.mean)} detail={percentileDetail(result.activeRerolls)} />
        <SummaryCard label="平均峰值棋子占用" value={number(result.peakBenchSlots.mean)} detail={`P(峰值 > ${result.occupancyLimit}) ${(result.peakOverLimitRate * 100).toFixed(1)}%`} />
        <SummaryCard label="完成率" value={`${(result.completionRate * 100).toFixed(1)}%`} detail={`${result.completedTrials.toLocaleString()} / ${result.totalTrials.toLocaleString()} 次`} />
      </div>

      <section className="cost-breakdown" aria-labelledby="cost-title">
        <div><h3 id="cost-title">平均金币拆分</h3><p>净金币 = 刷新 + 购买 + Ban − 骰子返还</p></div>
        <dl>
          <div><dt>刷新支出</dt><dd>{number(result.meanCosts.reroll)}</dd></div>
          <div><dt>目标 / IO 购买</dt><dd>{number(result.meanCosts.purchases)}</dd></div>
          <div><dt>羁绊 Ban</dt><dd>{number(result.meanCosts.ban)}</dd></div>
          <div><dt>骰子返还</dt><dd>−{number(result.meanCosts.diceRefund)}</dd></div>
        </dl>
      </section>

      <div className="charts-grid">
        <DistributionChart title="净金币" unit="金" summary={result.netGold} />
        <DistributionChart title="主动刷新" unit="次" summary={result.activeRerolls} />
        <DistributionChart title="峰值棋子占用" unit="格" summary={result.peakBenchSlots} benchLimit={result.occupancyLimit} />
      </div>

      {result.incompleteTrials > 0 && (
        <details className="failure-details"><summary>未完成样本 {result.incompleteTrials.toLocaleString()} 次</summary><ul>{Object.entries(result.incompleteReasons).map(([reason, count]) => <li key={reason}>{reason}: {count}</li>)}</ul></details>
      )}
    </section>
  );
}
