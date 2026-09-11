import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/data/game-data.generated', () => ({
  gameData: {
    pieces: [
      { id: 'chess_axe', name: '斧王', cost: 1, synergies: ['is_orc', 'is_warrior'], icon: '/chess-icons/axe.png', poolCount: 20, sourceOrder: 0 },
      { id: 'chess_lina', name: '莉娜', cost: 3, synergies: ['is_human', 'is_mage'], icon: '/chess-icons/lina.png', poolCount: 15, sourceOrder: 1 },
      { id: 'chess_tide', name: '潮汐猎人', cost: 5, synergies: ['is_naga', 'is_hunter'], icon: '/chess-icons/tide.png', poolCount: 10, sourceOrder: 2 },
      { id: 'chess_fur', name: '先知', cost: 2, synergies: ['is_elf', 'is_druid'], icon: '/chess-icons/fur.png', poolCount: 20, sourceOrder: 3 },
    ],
    synergies: [
      { id: 'is_orc', name: '兽人', kind: 'race', pieceIds: ['chess_axe'] },
      { id: 'is_warrior', name: '战士', kind: 'class', pieceIds: ['chess_axe'] },
      { id: 'is_human', name: '人类', kind: 'race', pieceIds: ['chess_lina'] },
      { id: 'is_mage', name: '法师', kind: 'class', pieceIds: ['chess_lina'] },
      { id: 'is_naga', name: '娜迦', kind: 'race', pieceIds: ['chess_tide'] },
      { id: 'is_hunter', name: '猎人', kind: 'class', pieceIds: ['chess_tide'] },
      { id: 'is_elf', name: '光羽族', kind: 'race', pieceIds: ['chess_fur'] },
      { id: 'is_druid', name: '德鲁伊', kind: 'class', pieceIds: ['chess_fur'] },
    ],
  },
}));

import App from '../src/App';

type MessageListener = (event: MessageEvent) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  static posted: Array<{ worker: FakeWorker; message: unknown }> = [];
  listeners = new Set<MessageListener>();
  messages: unknown[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: MessageListener) {
    if (type === 'message') this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: MessageListener) {
    if (type === 'message') this.listeners.delete(listener);
  }

  postMessage(message: unknown) {
    this.messages.push(message);
    FakeWorker.posted.push({ worker: this, message });
  }

  terminate() {
    this.listeners.clear();
  }

  emit(data: unknown) {
    this.listeners.forEach((listener) => listener({ data } as MessageEvent));
  }
}

const result = {
  version: 1 as const,
  requestedTrials: 10000,
  totalTrials: 10000,
  completedTrials: 9800,
  incompleteTrials: 200,
  completionRate: 0.98,
  occupancyLimit: 16,
  peakOverLimitRate: 0,
  netGold: { count: 9800, mean: 52.4, variance: 16, min: 30, max: 81, p10: 42, p25: 47, p50: 52, p75: 58, p90: 64, p95: 69, frequency: { 30: 100, 52: 5000, 81: 4700 } },
  activeRerolls: { count: 9800, mean: 17.2, variance: 9, min: 4, max: 35, p10: 10, p25: 13, p50: 17, p75: 21, p90: 25, p95: 28, frequency: { 4: 300, 17: 6000, 35: 3500 } },
  peakBenchSlots: { count: 9800, mean: 6.3, variance: 2, min: 2, max: 11, p10: 4, p25: 5, p50: 6, p75: 7, p90: 9, p95: 10, frequency: { 2: 300, 6: 6000, 11: 3500 } },
  meanCosts: { leveling: 96, reroll: 34.4, purchases: 19.3, ban: 4, diceRefund: 5.3 },
  meanIoPurchased: 0.4,
  meanMorningStarTriggers: 0.2,
  incompleteReasons: { 'max-rerolls': 200 },
  activeFiveCostIds: ['chess_tide'],
};

function worker() {
  const instance = FakeWorker.posted.at(-1)?.worker
    ?? [...FakeWorker.instances].reverse().find((candidate) => candidate.listeners.size > 0);
  if (!instance) throw new Error('Worker was not created');
  return instance;
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.posted = [];
  localStorage.clear();
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Auto Chess simulator UI', () => {
  it('opens usage instructions in a dismissible drawer without an oversized hero', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '构建你的搜牌场景' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '模拟假设' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '使用说明' }));
    const drawer = screen.getByRole('dialog', { name: '使用说明' });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByRole('heading', { name: '锁定最优配置维度' })).toBeInTheDocument();
    expect(within(drawer).getByText(/净金币 = 升级支出/)).toBeInTheDocument();
    expect(within(drawer).getByRole('heading', { name: '启明星与自动合成' })).toBeInTheDocument();
    expect(within(drawer).getByText(/先进行启明星判定/)).toBeInTheDocument();
    expect(within(drawer).getByRole('heading', { name: '模型假设' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '使用说明' })).not.toBeInTheDocument();
  });

  it('filters by race and class, searches synergy names, and batch-adds checked pieces', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByRole('combobox', { name: '种族筛选' }), 'is_orc');
    expect(screen.getByRole('option', { name: /斧王/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /莉娜/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '种族筛选' }), '');
    await user.selectOptions(screen.getByRole('combobox', { name: '职业筛选' }), 'is_mage');
    expect(screen.getByRole('option', { name: /莉娜/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /斧王/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '职业筛选' }), '');
    const search = screen.getByRole('combobox', { name: '搜索棋子' });
    await user.type(search, '猎人');
    await user.click(screen.getByRole('option', { name: /潮汐猎人/ }));
    await user.clear(search);
    await user.click(screen.getByRole('option', { name: /斧王/ }));

    expect(screen.getByRole('button', { name: '添加已选棋子（2）' })).toBeEnabled();
    expect(screen.queryByText('斧王', { selector: '.target-name' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '添加已选棋子（2）' }));

    expect(screen.getAllByRole('spinbutton', { name: '目标一星等价份数' })).toHaveLength(2);
    expect(screen.getByText('斧王', { selector: '.target-name' })).toBeInTheDocument();
    expect(screen.getByText('潮汐猎人', { selector: '.target-name' })).toBeInTheDocument();
  });

  it('explains the Morning Star combination override when selected', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('搜牌圣物'), 'morning-star');
    expect(screen.getByRole('note')).toHaveTextContent('启明星会关闭购买前自动合成');
  });

  it('combines race and class filters', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByRole('combobox', { name: '种族筛选' }), 'is_orc');
    await user.selectOptions(screen.getByRole('combobox', { name: '职业筛选' }), 'is_mage');

    expect(screen.getByText('没有符合条件的棋子')).toBeInTheDocument();
  });

  it('offers two and four copy targets for druids', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '先知');
    await user.click(screen.getByRole('option', { name: /先知/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));

    expect(screen.getByRole('button', { name: '设为 2 份' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设为 4 份' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '设为 9 份' })).not.toBeInTheDocument();
  });

  it('configures multiple targets and prevents a conflicting synergy ban', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '斧王');
    await user.click(screen.getByRole('option', { name: /斧王/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));
    await user.click(screen.getByRole('button', { name: '设为 9 份' }));

    await user.clear(screen.getByRole('combobox', { name: '搜索棋子' }));
    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '莉娜');
    await user.click(screen.getByRole('option', { name: /莉娜/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));

    expect(screen.getAllByRole('spinbutton', { name: '目标一星等价份数' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '设为 9 份', pressed: true })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '羁绊 Ban' }), 'is_orc');
    expect(screen.getByRole('alert')).toHaveTextContent('目标冲突');
    expect(screen.getByRole('button', { name: '开始模拟' })).toBeDisabled();
  });

  it('sends a versioned run request, reports progress, and cancels', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '斧王');
    await user.click(screen.getByRole('option', { name: /斧王/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));
    await user.selectOptions(screen.getByLabelText('玩家等级'), '8');
    expect(screen.getByText('从 5 级升级需 96 金')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /扬升/ }));
    await user.selectOptions(screen.getByLabelText('搜牌圣物'), 'weighted-dice');
    await user.click(screen.getByRole('checkbox', { name: '使用精灵球' }));
    await user.clear(screen.getByLabelText('随机种子'));
    await user.type(screen.getByLabelText('随机种子'), 'ui-test');
    await user.click(screen.getByRole('button', { name: '开始模拟' }));
    const postedRun = FakeWorker.posted.find((entry) => (entry.message as { type?: string }).type === 'run');
    const runMessage = postedRun?.message as { type: string; requestId: string; config: Record<string, unknown> };
    expect(runMessage).toMatchObject({
      type: 'run',
      config: { level: 8, talent: 'promotion', relic: 'weighted-dice', useIo: true, seed: 'ui-test', trials: 10000 },
    });

    fireEvent(window, new Event('noop'));
    postedRun!.worker.emit({ type: 'progress', requestId: runMessage.requestId, completed: 5000, total: 10000 });
    expect((await screen.findAllByText('50%')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '取消模拟' }));
    expect(worker().messages.at(-1)).toEqual({ type: 'cancel', requestId: runMessage.requestId });
  });

  it('sends an optimization request with dimension locks and reports coarse progress', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '斧王');
    await user.click(screen.getByRole('option', { name: /斧王/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));
    expect(screen.getByRole('button', { name: '锁定玩家等级' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '锁定玩家等级' })).toHaveTextContent('未锁定');
    expect(screen.getByRole('button', { name: '锁定搜牌圣物' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '锁定15 回合天赋' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '锁定是否使用精灵球' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '锁定羁绊 Ban' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: '锁定玩家等级' }));
    await user.selectOptions(screen.getByLabelText('玩家等级'), '7');
    await user.click(screen.getByRole('button', { name: '锁定是否使用精灵球' }));
    await user.click(screen.getByRole('button', { name: '锁定羁绊 Ban' }));
    expect(screen.getByRole('button', { name: '解锁玩家等级' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '解锁玩家等级' })).toHaveTextContent('已锁定');
    expect(screen.getByLabelText('玩家等级')).toHaveValue('7');
    await user.click(screen.getByRole('button', { name: '计算最优配置' }));
    expect(screen.getByRole('button', { name: '解锁玩家等级' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '锁定搜牌圣物' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '锁定15 回合天赋' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '解锁是否使用精灵球' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '解锁羁绊 Ban' })).toBeDisabled();

    const postedOptimize = FakeWorker.posted.find((entry) => (entry.message as { type?: string }).type === 'optimize');
    const optimizeMessage = postedOptimize?.message as { type: string; requestId: string; config: Record<string, unknown> };
    expect(optimizeMessage).toMatchObject({
      type: 'optimize',
      config: {
        targets: [{ chessId: 'chess_axe', copies: 1 }],
        relic: 'none',
        trials: 10000,
        seed: 'autochess',
      },
      locks: {
        level: true,
        relic: false,
        talent: false,
        useIo: true,
        bannedSynergy: true,
      },
    });

    postedOptimize!.worker.emit({
      type: 'optimization-progress',
      requestId: optimizeMessage.requestId,
      phase: 'screen',
      completedTrials: 500,
      totalTrials: 1000,
      completedConfigurations: 1,
      totalConfigurations: 2,
    });
    expect(await screen.findByRole('heading', { name: '正在快速筛选配置' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2 个配置')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows ranked optimization results and applies only the searched fields', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '斧王');
    await user.click(screen.getByRole('option', { name: /斧王/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));
    await user.selectOptions(screen.getByLabelText('搜牌圣物'), 'morning-star');
    await user.click(screen.getByRole('button', { name: '锁定搜牌圣物' }));
    await user.clear(screen.getByLabelText('随机种子'));
    await user.type(screen.getByLabelText('随机种子'), 'keep-this-seed');
    await user.click(screen.getByRole('button', { name: '计算最优配置' }));

    const postedOptimize = FakeWorker.posted.find((entry) => (entry.message as { type?: string }).type === 'optimize');
    const optimizeMessage = postedOptimize?.message as { requestId: string };
    postedOptimize!.worker.emit({
      type: 'optimization-complete',
      requestId: optimizeMessage.requestId,
      result: {
        version: 1,
        requestedTrials: 10000,
        coarseTrials: 50,
        candidateCount: 100,
        confirmationCount: 100,
        finalistCount: 12,
        reliabilityWarning: false,
        rankings: [
          { rank: 1, extraMeanGold: 0, choice: { level: 6, relic: 'weighted-dice', talent: 'promotion', bannedSynergy: 'is_mage', useIo: true }, aggregate: { ...result, netGold: { ...result.netGold, mean: 40 }, activeRerolls: { ...result.activeRerolls, mean: 12 } } },
          { rank: 2, extraMeanGold: 2.4, choice: { level: 7, relic: 'remainder-seeker', talent: 'greed', bannedSynergy: null, useIo: false }, aggregate: { ...result, netGold: { ...result.netGold, mean: 42.4 }, activeRerolls: { ...result.activeRerolls, mean: 13 } } },
        ],
      },
    });

    expect(await screen.findByRole('heading', { name: '最优配置' })).toBeInTheDocument();
    expect(screen.getByText('推荐配置')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '次优配置' })).toBeInTheDocument();
    expect(screen.getByText('+2.4 金')).toBeInTheDocument();
    expect(screen.getByText(/6 级 · 加重骰子 · 扬升/)).toBeInTheDocument();
    expect(screen.getByText(/7 级 · 寻幽罗盘 · 贪婪/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '应用第 1 名配置' }));
    expect(screen.getByLabelText('玩家等级')).toHaveValue('6');
    expect(screen.getByRole('radio', { name: /扬升/ })).toBeChecked();
    expect(screen.getByLabelText('羁绊 Ban')).toHaveValue('is_mage');
    expect(screen.getByRole('checkbox', { name: '使用精灵球' })).toBeChecked();
    expect(screen.getByLabelText('搜牌圣物')).toHaveValue('weighted-dice');
    expect(screen.getByRole('button', { name: '解锁搜牌圣物' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('随机种子')).toHaveValue('keep-this-seed');
    expect(screen.getByLabelText('模拟次数')).toHaveValue('10000');
    expect(screen.getByRole('button', { name: '锁定玩家等级' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('斧王', { selector: '.target-name' })).toBeInTheDocument();
  });

  it('shows summary, histogram/CDF, and accessible table views', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '潮汐');
    await user.click(screen.getByRole('option', { name: /潮汐猎人/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));
    await user.click(screen.getByRole('button', { name: '开始模拟' }));

    const postedRun = FakeWorker.posted.find((entry) => (entry.message as { type?: string }).type === 'run');
    const runMessage = postedRun?.message as { requestId: string };
    postedRun!.worker.emit({ type: 'complete', requestId: runMessage.requestId, result });

    expect(await screen.findByRole('heading', { name: '模拟结果' })).toBeInTheDocument();
    expect(screen.getByText('52.4')).toBeInTheDocument();
    expect(screen.getByText('98.0%')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /分布直方图/ })).toHaveLength(3);
    expect(screen.getByText('净金币 = 升级 + 刷新 + 购买 + Ban − 骰子返还')).toBeInTheDocument();
    expect(screen.getByText('升级支出', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('96', { selector: 'dd' })).toBeInTheDocument();

    const benchPanel = screen.getByRole('region', { name: '峰值棋子占用分布' });
    await user.click(within(benchPanel).getByRole('button', { name: '累计分布' }));
    expect(within(benchPanel).getByRole('img', { name: /累计分布/ })).toBeInTheDocument();
    await user.click(within(benchPanel).getByRole('button', { name: '数据表' }));
    expect(within(benchPanel).getByRole('table', { name: '峰值棋子占用完整频数' })).toBeInTheDocument();
    expect(within(benchPanel).getByText(/16 格容量线/)).toBeInTheDocument();
  });

  it('restores the latest valid configuration from local storage', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.type(screen.getByRole('combobox', { name: '搜索棋子' }), '斧王');
    await user.click(screen.getByRole('option', { name: /斧王/ }));
    await user.click(screen.getByRole('button', { name: '添加已选棋子（1）' }));
    await user.selectOptions(screen.getByLabelText('玩家等级'), '7');
    await user.click(screen.getByRole('button', { name: '锁定玩家等级' }));
    await user.clear(screen.getByLabelText('随机种子'));
    await user.type(screen.getByLabelText('随机种子'), 'persisted-seed');
    unmount();

    render(<App />);
    expect(screen.getByLabelText('玩家等级')).toHaveValue('7');
    expect(screen.getByRole('button', { name: '解锁玩家等级' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('随机种子')).toHaveValue('persisted-seed');
    expect(screen.getByText('斧王', { selector: '.target-name' })).toBeInTheDocument();
  });
});
