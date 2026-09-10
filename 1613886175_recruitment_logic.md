# 1613886175.vpk 招募棋子逻辑分析

> 来源：使用 Source2Viewer CLI 解包并反编译 `1613886175.vpk` 后，对 Lua、Panorama JavaScript、XML 和 KV 配置进行只读分析。
>
> 反编译目录：`1613886175_decompiled/`

## 1. 核心文件

| 模块 | 文件 |
|---|---|
| 服务端主逻辑 | `1613886175_decompiled/scripts/vscripts/addon_game_mode.lua` |
| Panorama 客户端 | `1613886175_decompiled/panorama/scripts/custom_game/dac.js` |
| 商店 UI 布局 | `1613886175_decompiled/panorama/layout/custom_game/dac.xml` |
| 棋子单位配置 | `1613886175_decompiled/scripts/npc/npc_units_custom.txt` |
| 招募技能配置 | `1613886175_decompiled/scripts/npc/npc_abilities_custom.txt` |
| 前端棋子映射 | `1613886175_decompiled/panorama/scripts/custom_game/chess_data.js` |

棋子招募系统不是 Dota 原生商店。`scripts/shops/dota_auto_chess_shops.txt` 与其没有直接关系。

## 2. 完整调用链

```text
游戏开始
  │
  ├─ InitChessPool()
  │    └─ 按费用和单种棋子的份数初始化公共棋池
  │
准备回合开始 / 玩家主动刷新
  │
  └─ Draw5ChessAndShow(team_id, ...)
       │
       ├─ 将旧商店里未购买的普通棋子返还公共棋池
       ├─ RandomNDrawChessNew(..., 5, ...)
       │    └─ 循环生成 5 个候选
       │         └─ RandomDrawChessNew()
       │              ├─ 根据玩家等级抽取费用档位
       │              └─ DrawAChessFromChessPool()
       │                   └─ 从公共棋池立即移除一份棋子
       │
       └─ 发送 show_draw_card
            │
            ▼
Panorama：OnShowDrawCard()
  ├─ 保存 MY_DRAW_CHESS_LIST
  └─ show_panel_draw_card()
       └─ 渲染五个棋子槽位

玩家点击棋子
  │
  └─ request_buy_chess(index)
       ├─ 客户端余额预检
       └─ 发送 request_buy_chess { buy_index }
            │
            ▼
服务端：DAC:OnRequestBuyChess()
  ├─ 从服务端商店表读取商品
  ├─ 校验余额
  ├─ 校验候补区和自动合成条件
  ├─ 扣除金币或代币
  ├─ 清除商店槽位
  ├─ 发送 request_buy_chess_cb
  └─ 创建棋子
       ├─ CreateChessInHandAsync()：进入候补区
       └─ CombineChessPlusAsync()：直接合成
```

## 3. 网络事件

服务端注册位置：`1613886175_decompiled/scripts/vscripts/addon_game_mode.lua:347-355`

| 事件 | 服务端处理函数 | 作用 |
|---|---|---|
| `request_buy_chess` | `DAC:OnRequestBuyChess` | 购买指定商店槽位 |
| `dac_refresh_chess` | `DAC:OnRefreshChess` | 手动刷新或特殊重抽 |
| `lock_chess` | `DAC:OnLockChess` | 锁定当前商店 |
| `unlock_chess` | `DAC:OnUnlockChess` | 解锁当前商店 |

客户端订阅位置：`1613886175_decompiled/panorama/scripts/custom_game/dac.js:1-56`

| 服务端事件 | 客户端处理函数 |
|---|---|
| `show_draw_card` | `OnShowDrawCard` |
| `request_buy_chess_cb` | `OnRequestBuyChessCb` |
| `show_gold` | `OnShowGold` |
| `update_my_money` | `UpdateMyMoney` |
| `refill_chess_in_panel` | `RefillChessInPanel` |

客户端还监听网络表 `chess_pool_table`，用于棋池、折扣、禁用和传奇棋子信息。

## 4. 公共棋池

### 4.1 默认容量

默认参数位于 `1613886175_decompiled/scripts/vscripts/addon_game_mode.lua:1406-1415`：

```lua
_G.CHESS_POOL_SIZE = 5
_G.CHESS_INIT_COUNT = {
    [1] = 4,
    [2] = 4,
    [3] = 3,
    [4] = 3,
    [5] = 2,
}
```

每一种棋子的初始份数为：

```text
CHESS_INIT_COUNT[费用] × CHESS_POOL_SIZE
```

| 费用 | 每一种棋子的默认初始份数 |
|---:|---:|
| 1 费 | 20 |
| 2 费 | 20 |
| 3 费 | 15 |
| 4 费 | 15 |
| 5 费 | 10 |

初始化函数 `InitChessPool()` 位于 `addon_game_mode.lua:13119-13148`：

```lua
for cost, v in pairs(_G.chess_list_by_mana) do
    for _, chess in pairs(v) do
        local chess_count = _G.CHESS_INIT_COUNT[cost] * chess_pool_times
        for i = 1, chess_count do
            AddAChessToChessPool(chess)
        end
    end
end
```

### 4.2 运行时覆盖

远程服务返回的 `t.chess_pool` 可以覆盖本地默认参数，处理逻辑位于 `addon_game_mode.lua:3116-3149`：

- `pool_size`
- `chess_init_1`～`chess_init_5`
- `chess_africa_1`～`chess_africa_5`

因此 20/20/15/15/10 是本地默认值，不一定等于线上某场对局的最终参数。

### 4.3 棋子基础费用

服务端加载 `scripts/npc/npc_units_custom.txt`，并将基础棋子的 `Level` 写入 `_G.chess_2_mana`：

```lua
if not string.find(k, '1') then
    _G.chess_2_mana[k] = v['Level']
end
```

位置：`addon_game_mode.lua:2507-2532`

前端还维护了 `CHESS_2_LEVEL`，位置为 `panorama/scripts/custom_game/chess_data.js:151`，但该表只用于颜色、原价等 UI 展示。最终价格以服务端商店项的 `price` 为准。

## 5. 招募概率

服务端概率阈值位于 `addon_game_mode.lua:1845-1869`。对应概率为：

| 玩家等级 | 1费 | 2费 | 3费 | 4费 | 5费 |
|---:|---:|---:|---:|---:|---:|
| 1 | 100% | 0% | 0% | 0% | 0% |
| 2 | 85% | 15% | 0% | 0% | 0% |
| 3 | 70% | 25% | 5% | 0% | 0% |
| 4 | 55% | 35% | 10% | 0% | 0% |
| 5 | 45% | 35% | 18% | 2% | 0% |
| 6 | 35% | 35% | 25% | 5% | 0% |
| 7 | 25% | 30% | 35% | 10% | 0% |
| 8 | 20% | 30% | 32% | 17% | 1% |
| 9 | 20% | 25% | 27% | 25% | 3% |
| 10 | 15% | 25% | 25% | 29% | 6% |
| 11～16 | 15% | 20% | 20% | 36% | 9% |

同一套数据还配置在 `scripts/npc/npc_abilities_custom.txt:2553-2559`。

抽取过程：

```text
生成 1～100 的随机数
  → 根据玩家等级确定费用档位
  → 从该费用的公共棋池中选取具体棋子
```

入口函数：

- `RandomDrawChessNew()`：`addon_game_mode.lua:14919`
- 概率选择：`addon_game_mode.lua:14963-14981`
- 公共池选择：`DrawAChessFromChessPool()`，`addon_game_mode.lua:16606`

具体棋子的出现概率还会受到以下因素影响：

- 公共池剩余份数；
- 当前和前一轮的重复屏蔽；
- 被禁用的职业或种族；
- 五费棋子揭示状态；
- 强制阵容；
- 特殊天赋和道具；
- 防非/保底计数。

### 实现隐患

概率阈值使用：

```lua
for per, lv in pairs(_G.chess_gailv[draw_level]) do
```

Lua 规范不保证 `pairs()` 按数值键递增迭代，而该算法依赖阈值顺序。更稳妥的实现应使用有序数组、排序后的键或 `ipairs()`。

## 6. 五个商店槽位的生成

入口：`RandomNDrawChessNew()`，位于 `addon_game_mode.lua:14781-14917`。

它反复调用 `RandomDrawChessNew()`，直到取得五个有效候选。每个商店项包含：

```lua
{
    chess = new_chess,
    price = price,
    old_price = old_price,
    money = money,
    class_list = class_list,
    extra_synergy = extra_synergy,
    wheel_chess_star = hh.wheel_chess_star,
    wheel_properties = hh.wheel_properties,
}
```

支持的货币包括：

- `gold`
- `gold_token`
- `rm_token`
- `common_token`

### 折扣

可见的折扣路径包括：

1. `modifier_talent_2a_discount`：满足已有同名棋子等条件时减 1；
2. `IsChessDiscount(new_chess)`：减 2；
3. 价格最低为 0，不会变成负数。

位置：`addon_game_mode.lua:14810-14822`、`addon_game_mode.lua:14887-14893`。

## 7. 棋子在何时离开棋池

`DrawAChessFromChessPool()` 成功抽取普通棋子后立即执行：

```lua
table.remove(_G.chess_pool[cost], index)
_G.chess_remainder_table[chess_name] =
    _G.chess_remainder_table[chess_name] - 1
```

位置：`addon_game_mode.lua:16731-16736`

因此：

> 棋子出现在商店时，就已经从公共棋池扣除；不是玩家购买时才扣除。

这会产生以下结果：

- 玩家购买：该份棋子继续留在棋池外；
- 玩家没有购买并正常刷新：该份棋子返还公共池；
- 玩家锁定商店：该份棋子继续被商店占用。

## 8. 正常刷新时旧棋子返池

`Draw5ChessAndShow()` 位于 `addon_game_mode.lua:4377-4480`。

刷新旧商店时：

```lua
for _, chess in pairs(h.curr_chess_table) do
    if chess ~= nil and
       (h.last_draw_type == nil or
        h.last_draw_type == -1 or
        h.last_draw_type == 6) then
        table.insert(h.ban_chess_list, chess.chess)
        AddAChessToChessPool(chess.chess)
    end
end
```

位置：`addon_game_mode.lua:4414-4419`

随后清空商店并重新抽取：

```lua
h.curr_chess_table = {}
local curr_chess_table = RandomNDrawChessNew(team_id, 5, unlock, draw_type)
h.curr_chess_table = curr_chess_table
```

位置：`addon_game_mode.lua:4423-4427`

`ban_chess_list` 用来避免刚刷走的棋子马上再次出现。特殊 `draw_type` 可能使用不同的返池规则。

## 9. 每回合自动刷新

准备回合的 `PrepareATeam()` 会自动招募一次：

```lua
if v:HasModifier('modifier_item_second_chance') then
    Draw5ChessAndShow(v:GetTeam(), false, -1)
    v.second_draw_activate = true
else
    Draw5ChessAndShow(v:GetTeam(), false)
end
```

位置：`addon_game_mode.lua:4083-4108`

`unlock == false` 表示系统自动抽牌。

## 10. 手动刷新

前端发送：

```js
function refresh_chess() {
    GameEvents.SendCustomGameEventToServer("dac_refresh_chess", {
        team: Players.GetTeam(Players.GetLocalPlayer())
    });
}
```

位置：`panorama/scripts/custom_game/dac.js:1900-1904`

服务端 `DAC:OnRefreshChess()` 位于 `addon_game_mode.lua:27938-27971`，依次校验：

1. 客户端队伍是否与玩家真实队伍匹配；
2. 信使实体是否有效；
3. `summon_hero` 技能是否激活；
4. 技能冷却是否结束；
5. 玩家是否至少有 2 金币。

普通刷新执行：

```lua
hero.chesslock = false
CostMana(hero, 2)
Draw5ChessAndShow(keys.team, true)
```

结论：

- 普通手动刷新固定消耗 **2 金币**；
- 服务端额外施加 **0.6 秒冷却**；
- 主动刷新会解除商店锁定；
- “第二次机会”重抽分支不扣这 2 金币。

技能 KV 中还声明：

```text
AbilityCooldown = 0.3
AbilityManaCost = 2
```

位置：`scripts/npc/npc_abilities_custom.txt:2531-2559`。实际节流需以 Lua 服务端的 0.6 秒限制为准。

## 11. 商店锁定

客户端函数位于 `panorama/scripts/custom_game/dac.js:1853-1867`，根据当前状态发送 `lock_chess` 或 `unlock_chess`。

服务端处理位于 `addon_game_mode.lua:28065-28078`，核心只是设置：

```lua
hero.chesslock = true
-- 或
hero.chesslock = false
```

下一次自动刷新发现锁定时：

```lua
if h.chesslock == true then
    CustomGameEventManager:Send_ServerToTeam(..., "show_draw_card", {
        chesses = h.curr_chess_table,
        auto_unlock = true,
    })
    h.chesslock = false
    return
end
```

位置：`addon_game_mode.lua:4385-4394`

因此锁定规则是：

- 不返还当前商店棋子；
- 不重新抽取；
- 当前棋子继续占用公共棋池；
- 只阻止下一次自动刷新；
- 触发后自动解锁。

## 12. Panorama 商店 UI

主布局加载 `chess_data.js`、`utils.js` 和 `dac.js`，位置：`panorama/layout/custom_game/dac.xml:11-16`。

商店固定定义五个槽位：`dac.xml:531-618`。点击事件分别调用：

```text
request_buy_chess(0)
request_buy_chess(1)
request_buy_chess(2)
request_buy_chess(3)
request_buy_chess(4)
```

服务端生成候选后发送 `show_draw_card`：

```text
OnShowDrawCard(keys)
  → ShowDrawCard(keys)
  → MY_DRAW_CHESS_LIST = keys.chesses
  → show_panel_draw_card()
```

关键位置：

- 事件订阅：`panorama/scripts/custom_game/dac.js:5`
- UI 并发保护：`dac.js:1629-1644`
- 保存候选：`dac.js:1682-1685`
- 渲染五个槽位：`dac.js:6454-6675`

每张卡展示：

- 3D 棋子模型；
- 棋子头像和名称；
- 星级；
- 种族和职业；
- 折扣标识；
- 最终价格；
- 支付货币。

3D 模型路径格式：

```js
map: "maps/chess/" + c.chess + ".vmap"
```

位置：`dac.js:6475-6487`。

## 13. 客户端购买请求

客户端函数位于 `panorama/scripts/custom_game/dac.js:1583-1601`：

```js
function request_buy_chess(index) {
    if (!MY_DRAW_CHESS_LIST[index + 1]) {
        return;
    }

    var is_money_enough = check_buy_available(index);
    if (typeof is_money_enough == 'number') {
        GameEvents.SendCustomGameEventToServer("request_buy_chess", {
            buy_index: index + 1
        });
    }
}
```

XML 使用 0～4 的索引，而 Lua 表使用 1～5，所以发送时执行 `index + 1`。

客户端只提交：

```json
{
  "buy_index": 1
}
```

不会提交棋子名称、价格或货币类型。

`check_buy_available()` 位于 `dac.js:1689-1742`，只负责客户端预检和 UI 提示，不是安全边界。

## 14. 服务端购买校验

服务端入口：`DAC:OnRequestBuyChess()`，位于 `addon_game_mode.lua:26609-26763`。

它根据客户端提交的槽位，从服务端状态重新取得商品：

```lua
local buy_item = h.curr_chess_table[buy_index]
local chess = buy_item.chess
local price = buy_item.price
local money = buy_item.money
```

位置：`addon_game_mode.lua:26619-26625`

主要校验包括：

1. 玩家和棋手实体是否有效；
2. 商店槽位是否仍存在；
3. 金币或代币是否足够；
4. 候补区是否有空位；
5. 满格时是否能够立即自动合成。

金币实际存储在棋手 Mana 中，扣除函数为 `CostMana()`：`addon_game_mode.lua:12573-12598`。

## 15. 候补区和自动合成

候补区初始化为 8 个槽位：`addon_game_mode.lua:1442-1451`。

查找空位函数固定遍历 1～8：

```lua
function FindEmptyHandSlot(team_id)
    for i = 1, 8 do
        if _G.hand[team_id][i] == 0 then
            return i
        end
    end
end
```

位置：`addon_game_mode.lua:15118-15127`

购买前会通过 `Find2SameChessInHandOrOnBoard()` 检查已有同名棋子。候补区满时：

- 未启用自动合成：拒绝购买；
- 已启用自动合成但同名棋子不足两个：拒绝购买；
- 已启用自动合成且已有两个同名棋子：允许购买并立即合成。

判断位置：`addon_game_mode.lua:26654-26671`。

## 16. 扣款与创建棋子

校验成功后：

```lua
if money == nil or money == 'gold' then
    CostMana(h, price)
else
    CostToken(h, price, money)
end

h.curr_chess_table[buy_index] = nil
```

位置：`addon_game_mode.lua:26674-26687`

随后向前端发送 `request_buy_chess_cb`。

### 16.1 普通购买

普通路径调用：

```lua
CreateChessInHandAsync(h, chess, ...)
```

位置：`addon_game_mode.lua:26747-26761`。

异步包装器先预缓存模型：`addon_game_mode.lua:41888-41895`。

实际创建函数 `CreateChessInHand()` 位于 `addon_game_mode.lua:15467-15518`：

```lua
local index = FindEmptyHandSlot(team_id)
local x = CreateUnitByName(...)
x.hand_index = index
x.team_id = team_id

_G.hand[team_id][index] = 1
h.hand_entities[index] = x
```

同时会保存实际购买价、添加技能、固定和准备期无敌效果，并播放出生音效与特效。

### 16.2 自动合成

满足条件时调用：

```lua
CombineChessPlusAsync(
    { chess1, chess2 },
    chess .. '1',
    callback
)
```

位置：`addon_game_mode.lua:26717-26724`。

新购买的一星棋子不会先创建为独立实体，而是作为第三份材料，直接与已有两枚棋子合成为二星棋子。

## 17. 购买成功后的 UI

服务端发送 `request_buy_chess_cb` 后，客户端在 `dac.js:1602-1623` 中：

1. 播放购买音效；
2. 隐藏已购买槽位；
3. 清除 `MY_DRAW_CHESS_LIST[buy_index]`；
4. 更新其他卡片的购买状态；
5. 自动解除商店锁定；
6. 向服务端发送 `unlock_chess`。

## 18. 出售与返池

返池函数为 `AddAChessToChessPool()`：`addon_game_mode.lua:16821-16864`。

`GetChessRank1Count()` 会把高星棋子换算成基础一星份数：

| 类型 | 一星 | 二星 | 三星 |
|---|---:|---:|---:|
| 普通棋子 | 1 | 3 | 9 |
| 德鲁伊 | 1 | 2 | 4 |

换算位置：`addon_game_mode.lua:16800-16818`。

所以出售普通三星棋子时，公共池恢复 9 份基础棋子。IO、SSR、被摧毁棋子及部分特殊池棋子存在不返池规则。

## 19. 五费棋子的特殊处理

初始化棋池前会调用 `RandomLegendary()`：`addon_game_mode.lua:10993`。

该函数将五费棋子列表随机裁剪至 10 种：

```lua
while ll > 10 do
    local rn = RandomInt(1, ll)
    ...
    table.remove(_G.chess_list_by_mana[5], rn)
end
```

位置：`addon_game_mode.lua:11000-11010`。

所以并非所有五费棋子都会在每局进入普通公共棋池，代码中还包含逐步揭示机制。

## 20. 特殊招募分支

代码支持多种 `draw_type`，包括：

- 金色核心；
- 黑暗核心/黑市；
- 第二次机会；
- 奇观轮；
- 冷门棋子；
- 特殊代币招募；
- SSR。

这些分支可能复用 `RandomNDrawChessNew()` 和 `Draw5ChessAndShow()`，但会改变棋池、货币、价格、星级、额外羁绊或返池方式。

普通招募的主路径始终是：

```text
等级概率确定费用 → 对应公共棋池选择具体棋子
```

## 21. 实现风险与边界

### 21.1 异步创建失败缺少明显回滚

购买顺序是：

```text
扣款
→ 清除商店槽位
→ 通知前端购买成功
→ 异步预缓存
→ 创建棋子
```

位置：

- 扣款：`addon_game_mode.lua:26674-26683`
- 清除槽位：`addon_game_mode.lua:26687`
- 异步创建：`addon_game_mode.lua:26747-26761`

如果预缓存或 `CreateUnitByName()` 失败，该主路径没有明显的退款、槽位恢复和棋池恢复逻辑。

### 21.2 未检查扣款函数结果

调用方保存了 `CostMana()` 或 `CostToken()` 的返回值，但后续没有检查。购买前虽然已检查余额，但零价商品会使扣款函数返回 `false`，流程仍然继续创建棋子。实际效果是允许免费购买，但控制流语义不够清晰。

### 21.3 概率阈值遍历依赖 `pairs()`

概率选择依赖阈值顺序，却使用无序的 `pairs()`，存在潜在可移植性问题。

### 21.4 客户端 team 参数不是安全边界

购买请求只提交槽位；刷新请求会提交 `team`，服务端会核对玩家真实队伍。锁定/解锁处理器则直接根据 `keys.PlayerID` 获取真实队伍，并不信任客户端提交的 `team`。

## 22. 最终结论

1. 商店固定显示五个棋子槽位。
2. 普通招募先按玩家等级抽费用，再从该费用的公共有限棋池抽具体棋子。
3. 棋子进入商店时就已经从公共棋池扣除。
4. 未购买棋子在下次正常刷新时返池。
5. 锁定商店会使当前棋子继续占用公共棋池。
6. 锁定只阻止下一次自动刷新，之后自动解除。
7. 普通手动刷新固定消耗 2 金币。
8. 客户端购买时只提交槽位索引，不能指定棋子或价格。
9. 服务端负责余额、商品、候补区和自动合成校验。
10. 候补区固定为 8 格；可立即合成时，满格仍可购买。
11. 普通购买进入候补区，已有两个同名棋子时可以直接合成二星。
12. 棋子基础费用来自 `npc_units_custom.txt` 中基础单位的 `Level`。
13. 默认棋池数量可被远程服务动态覆盖。
14. 五费池每局会随机裁剪，并带有逐步揭示机制。
15. 普通二星和三星棋子返池时分别恢复 3 和 9 份基础棋子。

最简模型：

```text
玩家等级
  → 决定费用概率
  → 从公共有限棋池抽出五张
  → 棋子暂时由商店占用
  → 前端展示并提交槽位索引
  → 服务端重新读取商品并校验
  → 扣款
  → 进入八格候补区或直接合成
  → 未购买棋子在下次刷新时返池
```
