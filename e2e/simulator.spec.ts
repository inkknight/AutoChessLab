import { expect, test } from '@playwright/test';

async function addTarget(page: import('@playwright/test').Page, query: string, name: string) {
  const search = page.getByRole('combobox', { name: '搜索棋子' });
  await search.fill(query);
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

test.describe('Auto Chess simulator', () => {
  test('configures targets, runs, changes views, cancels, and restores configuration', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '构建你的搜牌场景' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    await page.getByRole('button', { name: '使用说明' }).click();
    await expect(page.getByRole('dialog', { name: '使用说明' })).toBeVisible();
    await page.getByRole('button', { name: '关闭使用说明' }).last().click();

    await page.getByRole('combobox', { name: '种族筛选' }).selectOption('is_orc');
    await addTarget(page, '斧王', '斧王');
    await page.getByRole('combobox', { name: '种族筛选' }).selectOption('');
    await page.getByRole('combobox', { name: '职业筛选' }).selectOption('is_mage');
    await addTarget(page, 'chess_lina', '秀逗魔导士');
    await page.getByRole('button', { name: '添加已选棋子（2）' }).click();
    await page.getByLabel('玩家等级', { exact: true }).selectOption('8');
    await page.getByRole('radio', { name: /扬升/ }).check();
    await page.getByLabel('搜牌圣物', { exact: true }).selectOption('weighted-dice');
    await page.getByRole('checkbox', { name: '使用精灵球' }).check();
    await page.getByLabel('随机种子').fill('playwright-smoke');
    await page.getByLabel('单局最大主动刷新').fill('1000');

    await page.getByRole('button', { name: '开始模拟' }).click();
    await expect(page.getByRole('heading', { name: '模拟结果' })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('region', { name: '净金币分布' }).getByRole('img')).toBeVisible();
    await expect(page.getByRole('region', { name: '主动刷新分布' }).getByRole('img')).toBeVisible();

    const bench = page.getByRole('region', { name: '峰值棋子占用分布' });
    await bench.getByRole('button', { name: '累计分布' }).click();
    await expect(bench.getByRole('img', { name: /累计分布/ })).toBeVisible();
    await bench.getByRole('button', { name: '数据表' }).click();
    await expect(bench.getByRole('table', { name: '峰值棋子占用完整频数' })).toBeVisible();
    expect((await page.screenshot({ fullPage: true })).byteLength).toBeGreaterThan(10_000);

    await page.getByLabel('随机种子').fill('cancelled-then-rerun');
    await page.getByLabel('模拟次数').selectOption('100000');
    await page.getByRole('button', { name: '开始模拟' }).click();
    await page.getByRole('button', { name: '取消模拟' }).click();
    await expect(page.getByText('模拟已取消')).toBeVisible();

    await page.getByLabel('模拟次数').selectOption('10000');
    await page.reload();
    await expect(page.getByLabel('玩家等级', { exact: true })).toHaveValue('8');
    await expect(page.getByLabel('随机种子')).toHaveValue('cancelled-then-rerun');
    await expect(page.locator('.target-name')).toContainText(['斧王', '秀逗魔导士']);
  });

  test('calculates and applies an optimal configuration', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await addTarget(page, '斧王', '斧王');
    await page.getByRole('button', { name: '添加已选棋子（1）' }).click();
    await page.getByLabel('随机种子').fill('optimizer-playwright');
    await page.getByRole('button', { name: '计算最优配置' }).click();

    await expect(page.getByRole('heading', { name: '最优配置' })).toBeVisible({ timeout: 180_000 });
    const recommendationCard = page.locator('.optimization-hero');
    await expect(recommendationCard.getByText('推荐配置')).toBeVisible();
    await expect(recommendationCard.getByText('平均净金币')).toBeVisible();
    await expect(recommendationCard.getByText('完成率')).toBeVisible();
    await expect(page.getByRole('table', { name: '次优配置' })).toBeVisible();

    const recommendation = await page.locator('.optimization-choice > strong').textContent();
    await page.getByRole('button', { name: '应用第 1 名配置' }).click();
    const level = recommendation?.match(/(\d+) 级/)?.[1];
    if (!level) throw new Error(`Cannot parse recommended level from ${recommendation}`);
    await expect(page.getByLabel('玩家等级', { exact: true })).toHaveValue(level);
    if (recommendation?.includes('扬升')) await expect(page.getByRole('radio', { name: /扬升/ })).toBeChecked();
    if (recommendation?.includes('贪婪')) await expect(page.getByRole('radio', { name: /贪婪/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '使用精灵球' })).toBeChecked({ checked: recommendation?.endsWith(' · 使用 IO') ?? false });
    expect((await page.screenshot({ fullPage: true })).byteLength).toBeGreaterThan(10_000);
  });

  test('remains usable at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '构建你的搜牌场景' })).toBeVisible();
    await addTarget(page, '斧王', '斧王');
    await page.getByRole('button', { name: '添加已选棋子（1）' }).click();
    await expect(page.getByRole('button', { name: '开始模拟' })).toBeVisible();
    await expect(page.getByRole('button', { name: '使用说明' })).toBeVisible();
    await expect(page.getByRole('button', { name: '锁定玩家等级' })).toContainText('未锁定');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
