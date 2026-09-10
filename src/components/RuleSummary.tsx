export function RuleSummary() {
  return (
    <aside className="rule-summary panel" aria-labelledby="assumptions-title">
      <span className="eyebrow">模型边界</span>
      <h2 id="assumptions-title">模拟假设</h2>
      <ul>
        <li><strong>全新公共池</strong><span>默认每枚 1–5 费棋子 20 / 20 / 15 / 15 / 10 份，无其他玩家占用。</span></li>
        <li><strong>首店免费</strong><span>先生成五卡首店，再开始每次 2 金的主动刷新。</span></li>
        <li><strong>理论棋子占用</strong><span>购买后立即自动合成；容量线为玩家等级的上场位 + 8 个候补位，超过后仍继续模拟并报告超限概率。</span></li>
        <li><strong>固定五费池</strong><span>目标五费必定入本局 10 枚活跃池，其余按源顺序补足并视为已揭示。</span></li>
        <li><strong>确定性购买策略</strong><span>自动合成；IO 优先帮助高费用、缺口更大、阵容顺序更前的目标。</span></li>
        <li><strong>远程折扣未建模</strong><span>不模拟场次外动态 discount_piece 冷门折扣。</span></li>
      </ul>
    </aside>
  );
}
