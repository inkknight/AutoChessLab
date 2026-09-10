import { useId, useMemo, useState } from 'react';
import type { MetricSummary } from '../simulation/types';

type View = 'histogram' | 'cdf' | 'table';

interface DistributionChartProps {
  title: string;
  unit: string;
  summary: MetricSummary;
  benchLimit?: number;
}

function compact(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function DistributionChart({ title, unit, summary, benchLimit }: DistributionChartProps) {
  const [view, setView] = useState<View>('histogram');
  const [focusedValue, setFocusedValue] = useState<number | null>(null);
  const titleId = useId();
  const data = useMemo(() => Object.entries(summary.frequency)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((left, right) => left.value - right.value), [summary.frequency]);
  const maxCount = Math.max(...data.map((item) => item.count), 1);
  const minValue = data[0]?.value ?? 0;
  const maxValue = data.at(-1)?.value ?? 1;
  const width = 720;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 16;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const range = Math.max(1, maxValue - minValue + 1);
  let running = 0;
  const cdfData = data.map((item) => {
    running += item.count;
    return { ...item, cumulative: running / summary.count };
  });
  const active = data.find((item) => item.value === focusedValue);

  const pointX = (value: number) => left + ((value - minValue + 0.5) / range) * plotWidth;
  const barWidth = Math.max(2, Math.min(24, plotWidth / range - 2));

  return (
    <section className="distribution-card" role="region" aria-labelledby={titleId}>
      <div className="chart-heading">
        <div><h3 id={titleId}>{title}分布</h3><p>完成样本 n = {summary.count.toLocaleString()}</p></div>
        <div className="view-switcher" aria-label={`${title}视图`}>
          <button type="button" aria-pressed={view === 'histogram'} onClick={() => setView('histogram')}>直方图</button>
          <button type="button" aria-pressed={view === 'cdf'} onClick={() => setView('cdf')}>累计分布</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>数据表</button>
        </div>
      </div>

      {benchLimit !== undefined && <p className="limit-note">{benchLimit} 格容量线 · 等级上场位 + 8 个候补位，超限区域已在图中标出</p>}
      {view === 'table' ? (
        <div className="table-scroll">
          <table aria-label={`${title}完整频数`}>
            <thead><tr><th scope="col">{unit}</th><th scope="col">样本数</th><th scope="col">占比</th><th scope="col">累计</th></tr></thead>
            <tbody>{cdfData.map((item) => <tr key={item.value}><th scope="row">{item.value}</th><td>{item.count.toLocaleString()}</td><td>{(item.count / summary.count * 100).toFixed(2)}%</td><td>{(item.cumulative * 100).toFixed(2)}%</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId}-svg-title ${titleId}-svg-desc`}>
            <title id={`${titleId}-svg-title`}>{title}{view === 'histogram' ? '分布直方图' : '累计分布'}</title>
            <desc id={`${titleId}-svg-desc`}>横轴为{unit}，数据可通过键盘聚焦并在数据表视图完整查看。</desc>
            {[0, 0.5, 1].map((ratio) => {
              const y = top + plotHeight * (1 - ratio);
              return <g key={ratio}><line className="gridline" x1={left} x2={width - right} y1={y} y2={y} /><text className="axis-label" x={left - 8} y={y + 4} textAnchor="end">{view === 'histogram' ? compact(maxCount * ratio) : `${Math.round(ratio * 100)}%`}</text></g>;
            })}
            {benchLimit !== undefined && (
              <g>
                <rect className="limit-area" x={pointX(benchLimit + 0.5)} y={top} width={Math.max(0, width - right - pointX(benchLimit + 0.5))} height={plotHeight} />
                <line className="limit-line" x1={pointX(benchLimit)} x2={pointX(benchLimit)} y1={top} y2={top + plotHeight} />
                <text className="limit-label" x={pointX(benchLimit) - 5} y={top + 12} textAnchor="end">{benchLimit} 格容量线</text>
              </g>
            )}
            {view === 'histogram' ? data.map((item) => {
              const barHeight = item.count / maxCount * plotHeight;
              return (
                <g key={item.value} className="chart-mark" tabIndex={0} role="graphics-symbol" aria-label={`${item.value} ${unit}：${item.count} 次，占 ${(item.count / summary.count * 100).toFixed(2)}%`} onFocus={() => setFocusedValue(item.value)} onBlur={() => setFocusedValue(null)} onMouseEnter={() => setFocusedValue(item.value)} onMouseLeave={() => setFocusedValue(null)}>
                  <rect className="bar-hit" x={pointX(item.value) - Math.max(12, barWidth / 2)} y={top} width={Math.max(24, barWidth)} height={plotHeight} />
                  <path className="bar-mark" d={`M ${pointX(item.value) - barWidth / 2} ${top + plotHeight} V ${top + plotHeight - barHeight + 4} Q ${pointX(item.value) - barWidth / 2} ${top + plotHeight - barHeight} ${pointX(item.value) - barWidth / 2 + 4} ${top + plotHeight - barHeight} H ${pointX(item.value) + barWidth / 2 - 4} Q ${pointX(item.value) + barWidth / 2} ${top + plotHeight - barHeight} ${pointX(item.value) + barWidth / 2} ${top + plotHeight - barHeight + 4} V ${top + plotHeight} Z`} />
                </g>
              );
            }) : (
              <path className="cdf-line" d={cdfData.map((item, index) => `${index === 0 ? 'M' : 'L'} ${pointX(item.value)} ${top + plotHeight * (1 - item.cumulative)}`).join(' ')} />
            )}
            <line className="axis" x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} />
            <text className="axis-label" x={left} y={height - 10}>{minValue}</text>
            <text className="axis-label" x={width - right} y={height - 10} textAnchor="end">{maxValue} {unit}</text>
          </svg>
          {active && <div className="chart-tooltip" role="status"><strong>{active.value} {unit}</strong><span>{active.count.toLocaleString()} 次 · {(active.count / summary.count * 100).toFixed(2)}%</span></div>}
        </div>
      )}
    </section>
  );
}
