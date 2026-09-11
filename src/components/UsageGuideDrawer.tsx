import { useEffect, useRef } from 'react';

interface UsageGuideDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function UsageGuideDrawer({ open, onClose }: UsageGuideDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="guide-layer">
      <button className="guide-backdrop" type="button" aria-label="关闭使用说明" onClick={onClose} />
      <aside className="guide-drawer" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <header className="guide-header">
          <div>
            <span className="eyebrow">Auto Chess Lab</span>
            <h2 id="guide-title">使用说明</h2>
          </div>
          <button ref={closeButtonRef} className="guide-close" type="button" aria-label="关闭使用说明" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div className="guide-content">
          <section>
            <span className="guide-index">01</span>
            <h3>快速开始</h3>
            <ol>
              <li>搜索并批量添加目标棋子，设置一星等价份数。</li>
              <li>配置等级、圣物、15 回合天赋、IO 与羁绊 Ban。</li>
              <li>运行普通模拟查看完整分布，或计算最优配置。</li>
            </ol>
          </section>

          <section>
            <span className="guide-index">02</span>
            <h3>锁定最优配置维度</h3>
            <p>每个可搜索条件旁都有锁定按钮。显示“已锁定”时，最优配置计算固定使用当前选择；显示“未锁定”时，优化器会探索该维度。</p>
            <p>锁定只影响最优配置计算，不影响普通模拟，也不会阻止你修改当前选项。</p>
          </section>

          <section>
            <span className="guide-index">03</span>
            <h3>金币口径</h3>
            <p className="guide-formula">净金币 = 升级支出 + 刷新支出 + 购买支出 + Ban 支出 − 骰子返还</p>
            <p>升级成本从刚到 5 级开始，以源码累计经验差按 1 经验 = 1 金计算，不扣除自然回合经验。</p>
          </section>

          <section>
            <span className="guide-index">04</span>
            <h3>启明星与自动合成</h3>
            <p>装备启明星时，目标棋子购买会先进行启明星判定，不让购买前的自动合成跳过本次机会。触发时直接获得二星；未触发时再加入一星并立即执行正常自动合成。</p>
          </section>

          <section>
            <span className="guide-index">05</span>
            <h3>模型假设</h3>
            <ul className="guide-assumptions">
              <li><strong>全新公共池</strong><span>默认每枚 1–5 费棋子 20 / 20 / 15 / 15 / 10 份，无其他玩家占用。</span></li>
              <li><strong>首店免费</strong><span>先生成五卡首店，再开始每次 2 金的主动刷新。</span></li>
              <li><strong>理论棋子占用</strong><span>购买后立即自动合成；容量线为玩家等级的上场位 + 8 个候补位，超限后仍继续模拟。</span></li>
              <li><strong>固定五费池</strong><span>目标五费必定进入本局 10 枚活跃池，其余按源码顺序补足。</span></li>
              <li><strong>确定性购买策略</strong><span>IO 优先帮助高费用、缺口更大、阵容顺序更前的目标。</span></li>
              <li><strong>未建模项</strong><span>不模拟场次外动态下发的 discount_piece 冷门折扣。</span></li>
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
