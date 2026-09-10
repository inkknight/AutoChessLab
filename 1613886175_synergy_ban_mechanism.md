# 羁绊 Ban（种族/职业屏蔽）机制分析

> 来源：`1613886175.vpk` 的 Source2Viewer 反编译结果。
>
> 核心文件：
>
> - `1613886175_decompiled/scripts/vscripts/addon_game_mode.lua`
> - `1613886175_decompiled/panorama/scripts/custom_game/dac.js`
> - `1613886175_decompiled/scripts/npc/npc_abilities_custom.txt`
> - `1613886175_decompiled/scripts/npc/npc_items_custom.txt`
> - `1613886175_decompiled/resource/addon_schinese.txt`

## 1. 核心结论

羁绊 Ban 本质上是一个**只对当前玩家生效的招募过滤器**。

玩家支付金币选择一个种族或职业后，服务端记录：

```lua
hero.synergy_banned = synergy
```

以后为该玩家生成招募商店时，如果抽出的候选棋子属于该羁绊，服务端会拒绝该候选并继续尝试抽取其他棋子。

它不是从公共棋池中永久删除某类棋子：

- 只影响执行 Ban 的玩家；
- 不影响其他玩家的招募；
- 不删除玩家已经拥有的棋子；
- 不修改等级对应的费用概率；
- 不会把对应羁绊从公共棋池中移除；
- 一名玩家同时只能屏蔽一个种族或职业；
- 通常只影响 Ban 之后新生成的商店，不追溯清理当前商店。

本地化说明明确写道：

```text
你只能同时屏蔽一个种族或者职业。此屏蔽不影响其他玩家的招募。
```

位置：`1613886175_decompiled/resource/addon_schinese.txt:6746-6749`。

## 2. 整体调用链

```text
初始化棋池和羁绊数据
  │
  └─ InitSynergyBanInfo()
       ├─ 为每个羁绊收集关联棋子
       ├─ 排除尚未揭示的传奇棋子
       ├─ 计算屏蔽价格
       └─ 发布 synergy_info / ban_info 网络表
            │
            ▼
玩家使用 ban_chess 技能
  │
  └─ RequestBanChess()
       └─ 发送 show_ban_choose 给 Panorama
            │
            ▼
Panorama 显示羁绊、关联棋子和价格
  │
  └─ 玩家确认选择
       └─ 发送 request_ban_chess { synergy, price }
            │
            ▼
服务端 DAC:OnBanChess()
  ├─ 检查玩家是否已有屏蔽
  ├─ 从服务端数据重新读取价格
  ├─ 检查狱卒的钥匙
  ├─ 检查并扣除金币
  └─ 设置 hero.synergy_banned
            │
            ▼
以后生成该玩家的商店
  │
  └─ DrawAChessFromChessPool()
       ├─ 按等级概率确定费用档位
       ├─ 从相应费用公共池取得候选
       ├─ 候选属于被屏蔽羁绊：返回 nil，重新尝试
       └─ 候选不属于被屏蔽羁绊：正式出池并进入商店
```

## 3. 屏蔽信息初始化

初始化函数：

```lua
InitSynergyBanInfo()
```

位置：`1613886175_decompiled/scripts/vscripts/addon_game_mode.lua:13150-13190`。

核心逻辑：

```lua
function InitSynergyBanInfo()
    local ban_table = {}
    _G.ban_chess_list = {}

    for syn, tbl in pairs(_G.chess_list_by_synergy) do
        if ban_table[syn] == nil then
            ban_table[syn] = {}
        end

        for _, chs in pairs(tbl) do
            if FindValueInTable(ban_table[syn], chs) == false then
                if FindValueInTable(
                    _G.unrevealed_legendary_chess_list,
                    chs
                ) == false then
                    table.insert(ban_table[syn], chs)
                end
            end
        end
    end

    for syn, chs_list in pairs(ban_table) do
        _G.ban_chess_list[syn] = {
            chess_list = CopyTable(chs_list),
            ban_price =
                math.floor(6 * table.maxn(chs_list) ^ 0.56),
        }
    end
end
```

这里生成了两套用途不同的数据：

### 3.1 `ban_table`

结构近似：

```lua
ban_table[synergy] = {
    "chess_a",
    "chess_b",
    "chess_c",
}
```

表示每个羁绊对应哪些可屏蔽棋子。

### 3.2 `_G.ban_chess_list`

结构近似：

```lua
_G.ban_chess_list[synergy] = {
    chess_list = {...},
    ban_price = 价格,
}
```

它同时保存：

- 该羁绊对应的棋子列表；
- 服务端认可的屏蔽价格。

## 4. 尚未揭示的传奇棋子

初始化屏蔽列表时会排除：

```lua
_G.unrevealed_legendary_chess_list
```

相关代码：

```lua
if FindValueInTable(
    _G.unrevealed_legendary_chess_list,
    chs
) == false then
    table.insert(ban_table[syn], chs)
end
```

位置：`addon_game_mode.lua:13157-13162`。

因此，尚未揭示的五费棋子：

- 不进入初始屏蔽棋子展示列表；
- 不参与初始屏蔽价格计算。

购买并揭示传奇棋子后，代码会重新调用：

```lua
InitSynergyBanInfo()
```

位置：`addon_game_mode.lua:26692-26710`。

所以随着本局传奇棋子被揭示：

- 某些羁绊的可屏蔽棋子列表可能增加；
- 对应屏蔽价格可能重新计算；
- 新数据会再次同步到客户端。

## 5. 屏蔽价格

价格公式为：

```lua
math.floor(6 * table.maxn(chs_list) ^ 0.56)
```

即：

```text
屏蔽价格 = floor(6 × 可屏蔽棋子种类数^0.56)
```

位置：`addon_game_mode.lua:13181-13185`。

示例：

| 可屏蔽棋子种类数 | 屏蔽价格 |
|---:|---:|
| 1 | 6 |
| 2 | 8 |
| 3 | 11 |
| 4 | 13 |
| 5 | 14 |
| 6 | 16 |
| 8 | 19 |
| 10 | 21 |
| 12 | 24 |
| 15 | 27 |
| 20 | 32 |

结论：

- 一个羁绊包含的棋子种类越多，总价格越高；
- 由于指数为 `0.56`，价格增长速度低于线性增长；
- 因此平均到每一种棋子的屏蔽成本会逐渐下降。

这与本地化说明一致：

```text
本局棋库中该种族/职业的棋子数量越多，屏蔽的价格越高。
但平均每个棋子的屏蔽价格会逐步下降。
```

位置：`resource/addon_schinese.txt:6747-6749`。

## 6. 服务端向客户端发布数据

初始化完成后，服务端写入两个网络表：

```lua
CustomNetTables:SetTableValue(
    "chess_pool_table",
    "synergy_info",
    ban_table
)

CustomNetTables:SetTableValue(
    "chess_pool_table",
    "ban_info",
    _G.ban_chess_list
)
```

位置：`addon_game_mode.lua:13188-13189`。

前端读取：

- `chess_pool_table/synergy_info`：每个羁绊的棋子列表；
- `chess_pool_table/ban_info`：屏蔽棋子列表和价格。

## 7. 打开屏蔽选择界面

信使技能：

```text
ban_chess
```

定义位置：

`1613886175_decompiled/scripts/npc/npc_abilities_custom.txt:2486-2505`

技能触发：

```lua
RequestBanChess
```

服务端函数：

```lua
function RequestBanChess(keys)
    local caster = keys.caster

    CustomGameEventManager:Send_ServerToTeam(
        caster:GetTeam(),
        "show_ban_choose",
        {
            key = GetClientKey(caster:GetTeam()),
            player_id = caster:GetPlayerID(),
            chess_pool = _G.chess_list_by_synergy,
            curr_money = caster:GetMana(),
        }
    )
end
```

位置：`addon_game_mode.lua:30526-30535`。

金币实际保存在信使的 Mana 中，所以这里的：

```lua
caster:GetMana()
```

代表玩家当前金币。

## 8. Panorama 屏蔽界面

客户端订阅以下事件：

```javascript
GameEvents.Subscribe("show_ban_choose", OnShowBanChoose);
GameEvents.Subscribe(
    "show_confirm_unban_synergy",
    OnShowConfirmUnbanSynergy
);
GameEvents.Subscribe("ban_chess", OnBanChess);
GameEvents.Subscribe("unban_chess", OnUnBanChess);
```

位置：`1613886175_decompiled/panorama/scripts/custom_game/dac.js:24-27`。

屏蔽选项渲染位置：

- 棋子图鉴中的单羁绊按钮：`dac.js:4179-4311`
- 完整选择窗口：`dac.js:4313-4506`

前端会：

1. 读取当前金币；
2. 读取 `synergy_info`；
3. 读取 `ban_info`；
4. 显示每个羁绊的名称；
5. 显示该羁绊对应的棋子；
6. 显示屏蔽价格；
7. 统计玩家当前已经拥有多少份该羁绊棋子；
8. 金币不足时将价格显示为红色；
9. 已有活动屏蔽时不再提供第二个屏蔽选项。

## 9. 已拥有棋子的前端统计

前端会统计玩家场上及候补区中的相关棋子：

- 一星棋子按 1 份计算；
- 二星棋子按 3 份计算；
- 三星棋子按 9 份计算。

位置：`dac.js:4326-4395`。

这个统计仅用于提示玩家：

```text
已经拥有：N
```

它不会：

- 阻止玩家屏蔽该羁绊；
- 删除这些棋子；
- 改变屏蔽价格。

## 10. 客户端提交屏蔽请求

玩家确认后，前端发送：

```javascript
GameEvents.SendCustomGameEventToServer(
    "request_ban_chess",
    {
        synergy: BAN_SYNERGY,
        price: BAN_PRICE,
    }
);
```

位置：`dac.js:4563-4569`。

请求中包含：

- `synergy`：选择的种族或职业；
- `price`：前端保存的显示价格。

但客户端价格不是安全边界，最终实际扣费由服务端重新计算。

## 11. 服务端执行屏蔽

服务端事件处理函数：

```lua
DAC:OnBanChess(keys)
```

位置：`addon_game_mode.lua:30537-30590`。

### 11.1 只允许一个活动屏蔽

```lua
if hero == nil or hero.synergy_banned ~= nil then
    return
end
```

只要 `hero.synergy_banned` 已经有值，新的屏蔽请求就会被拒绝。

### 11.2 服务端重新读取价格

```lua
local synergy = keys.synergy
local price = _G.ban_chess_list[synergy].ban_price or 999
```

服务端不使用客户端上传的 `keys.price`。

因此客户端即使伪造：

```json
{
  "synergy": "is_mage",
  "price": 0
}
```

也不会使普通屏蔽变成免费；服务端仍会读取自己的 `ban_price`。

### 11.3 检查金币并扣费

```lua
if hero:GetMana() < price then
    -- 金币不足提示
    return
else
    CostMana(hero, price)
end
```

金币不足时：

- 服务端拒绝请求；
- 向客户端发送金币不足提示；
- 播放失败音效。

金币足够时，服务端执行：

```lua
CostMana(hero, price)
hero.synergy_banned = synergy
hero.synergy_banned_price = price
```

`synergy_banned_price` 用来记录实际支付价格，主要与“狱卒的钥匙”的退款逻辑有关。

## 12. 屏蔽成功后的状态变化

服务端执行：

```lua
hero:RemoveAbility('ban_chess')
SetStat(hero:GetPlayerID(), 'ban_synergy', synergy)
AddAbilityAndSetLevel(hero, synergy .. '_banned')
hero:FindAbilityByName(
    synergy .. '_banned'
):SetActivated(false)
```

位置：`addon_game_mode.lua:30565-30577`。

例如屏蔽法师后，会添加：

```text
is_mage_banned
```

同时服务端会：

- 保存玩家统计 `ban_synergy`；
- 向玩家发送 `ban_chess` 事件；
- 更新 `chess_pool_table/ban_info_<PlayerID>`；
- 向其他玩家发送相应播报信息。

对应的 `<synergy>_banned` 技能定义位于：

`npc_abilities_custom.txt:1184-1812` 等位置。

这些技能用于显示当前屏蔽状态，并提供解除入口。

## 13. 普通公共棋池中的过滤

主要抽取函数：

```lua
DrawAChessFromChessPool(...)
```

位置：`addon_game_mode.lua:16606-16741`。

正常流程先根据费用从公共棋池取得一个候选：

```lua
index = RandomInt(1, table.maxn(_G.chess_pool[cost]))
chess_name = _G.chess_pool[cost][index]
```

之后检查候选是否属于被屏蔽羁绊：

```lua
if h.synergy_banned ~= nil and
   (
       FindValueInTable(
           _G.chess_list_by_synergy[h.synergy_banned],
           chess_name
       ) == true
       or
       FindValueInTable(
           _G.chess_list_by_synergy_black_and_pandaman[
               h.synergy_banned
           ],
           chess_name
       ) == true
       or
       FindValueInTable(
           _G.chess_list_by_synergy_ban_unavailable[
               h.synergy_banned
           ],
           chess_name
       ) == true
   ) then
    return nil
end
```

位置：`addon_game_mode.lua:16715-16718`。

如果候选属于被屏蔽羁绊：

```text
候选棋子被拒绝
  → 当前函数返回 nil
  → 外层招募流程继续尝试
  → 直到找到允许出现的棋子
```

## 14. 被过滤的候选不会从公共池扣除

正式从公共棋池移除棋子的代码位于屏蔽检查之后：

```lua
table.remove(_G.chess_pool[cost], index)

if _G.chess_remainder_table[chess_name] ~= nil then
    _G.chess_remainder_table[chess_name] =
        _G.chess_remainder_table[chess_name] - 1
end
```

位置：`addon_game_mode.lua:16731-16736`。

所以被屏蔽的候选在执行到这里之前就已经 `return nil`。

这意味着：

- 它不会进入当前玩家商店；
- 不会因为此次失败候选而离开公共棋池；
- 仍然可以被其他玩家招募；
- 不会减少全局剩余份数。

## 15. 多羁绊棋子的处理

屏蔽判断查询三套映射：

```lua
_G.chess_list_by_synergy
_G.chess_list_by_synergy_black_and_pandaman
_G.chess_list_by_synergy_ban_unavailable
```

因此只要棋子出现在被屏蔽羁绊的任一关联表中，就会被过滤。

例如一个棋子同时具有：

```text
精灵 + 猎人
```

玩家屏蔽猎人后，这枚棋子也不会再出现在该玩家之后生成的商店中，即使它同时具有精灵羁绊。

## 16. 金色池和黑色池

相同的羁绊过滤也出现在其他抽取函数中。

### 金色池

```lua
DrawAChessFromGoldPool(...)
```

过滤位置：`addon_game_mode.lua:16766-16768`。

### 黑色池

```lua
DrawAChessFromBlackPool(...)
```

过滤位置：`addon_game_mode.lua:16794-16796`。

这说明普通池、金色池和黑色池中的相关候选都会检查 `hero.synergy_banned`。

但不能把结论扩大为“游戏内任何特殊来源都不可能获得该棋子”。某个特殊产出是否受影响，仍取决于它是否调用这些带有屏蔽检查的抽取函数。

## 17. 对招募概率的影响

羁绊 Ban 不会直接修改：

```lua
_G.chess_gailv
```

也就是说，它不会改变玩家等级对应的费用档位概率。

例如 8 级玩家仍然先按照：

| 费用 | 概率 |
|---:|---:|
| 1 费 | 20% |
| 2 费 | 30% |
| 3 费 | 32% |
| 4 费 | 17% |
| 5 费 | 1% |

确定本次候选的费用。

羁绊 Ban 发生在确定费用后、选择具体棋子时。

因此它改变的是：

> 同一费用档位内部，各具体棋子的条件出现概率。

示例：

```text
某个费用档当前共有 10 种棋子
其中 3 种属于已屏蔽羁绊
```

这 3 种候选会被拒绝，剩余 7 种棋子的相对出现率因此提高。

但它不会产生：

```text
屏蔽一费棋子
  → 把原本的一费概率直接转移给四费或五费
```

费用档位仍然先由等级概率决定。

## 18. 对已有棋子的影响

屏蔽成功时，服务端没有遍历玩家场上和候补区删除棋子的逻辑。

所以：

- 场上已有棋子继续保留；
- 候补区已有棋子继续保留；
- 已有棋子的星级不变；
- 装备不受影响；
- 已激活羁绊不被直接取消；
- 玩家仍然可以出售这些棋子。

屏蔽只影响后续的招募候选。

## 19. 对当前商店的影响

`DAC:OnBanChess()` 没有清空或刷新：

```lua
hero.curr_chess_table
```

因此，从当前代码控制流看：

> 屏蔽不会追溯删除 Ban 前已经生成在当前商店中的棋子。

如果当前商店已经有属于该羁绊的棋子：

- 该棋子仍在服务端商店表中；
- 理论上仍可购买；
- 下一次刷新生成新商店时，才会应用新的羁绊过滤条件。

## 20. 对公共棋池和其他玩家的影响

屏蔽成功时没有修改：

```lua
_G.chess_pool
```

所以它不是：

```text
从本局公共棋库中删除整个羁绊
```

而是：

```text
为当前玩家抽牌时跳过该羁绊
```

结果是：

- 其他玩家仍然可以抽到这些棋子；
- 公共池剩余数量不因设置屏蔽而直接改变；
- 只有棋子真正进入某位玩家商店时，才从公共池扣除对应份数。

## 21. 解除屏蔽

玩家点击当前的 `<synergy>_banned` 技能后，执行：

```lua
UnbanSynergy(keys)
```

服务端先发送确认事件：

```lua
show_confirm_unban_synergy
```

前端确认后发送：

```javascript
GameEvents.SendCustomGameEventToServer(
    "request_unban_chess",
    {}
);
```

相关位置：

- 服务端弹出确认：`addon_game_mode.lua:30592-30599`
- 前端确认和请求：`dac.js:4508-4518`
- 服务端解除：`addon_game_mode.lua:30601-30618`

解除核心逻辑：

```lua
local synergy = caster.synergy_banned
caster.synergy_banned = nil

if synergy == nil then
    return
end

caster:RemoveAbility(synergy .. '_banned')
AddAbilityAndSetLevel(caster, 'ban_chess')
SetStat(caster:GetPlayerID(), 'ban_synergy', nil)
```

解除后：

- 清空 `hero.synergy_banned`；
- 删除当前 `<synergy>_banned` 技能；
- 恢复 `ban_chess` 技能；
- 后续招募不再过滤原羁绊；
- 玩家可以再次付费选择其他羁绊。

## 22. 免费解除不等于退款

本地化描述为：

```text
屏蔽后你将不会招募到该种族/职业的棋子，
并可以随时免费解除此屏蔽。
```

位置：`resource/addon_schinese.txt:6749`。

这里的“免费解除”表示解除操作本身不再收费。

普通解除代码没有退款逻辑，而且清空历史价格的代码被注释：

```lua
-- caster.synergy_banned_price = 0
```

位置：`addon_game_mode.lua:30598`、`30606`。

因此正常流程是：

```text
支付金币设置屏蔽
  → 免费解除
  → 不退还原屏蔽费用
  → 再次设置屏蔽需要重新支付
```

## 23. 狱卒的钥匙

相关圣物：

```text
item_free_ban
狱卒的钥匙
```

道具定义：

`1613886175_decompiled/scripts/npc/npc_items_custom.txt:5639-5666`

本地化效果：

```text
你可以免费屏蔽任意种族/职业。如果已经屏蔽，则返还所花费的金币。
```

位置：`resource/addon_schinese.txt:5368`。

### 23.1 先获得钥匙，再设置屏蔽

服务端检查：

```lua
if hero:HasModifier('modifier_item_free_ban') then
    price = 0
end
```

位置：`addon_game_mode.lua:30552-30554`。

所以持有钥匙时，新屏蔽不消耗金币。

### 23.2 先付费屏蔽，再获得钥匙

获得圣物时：

```lua
if loot == 'item_free_ban' then
    if hero.synergy_banned_price ~= nil
       and hero.synergy_banned_price > 0 then

        DropMoneyBag(
            Vector(0, 0, 128),
            position_to,
            300,
            hero.synergy_banned_price or 1
        )

        hero.synergy_banned_price = 0
    end
end
```

位置：`addon_game_mode.lua:28562-28570`。

这不是直接修改 Mana，而是在棋盘附近掉落等额钱袋。

### 23.3 当前随机圣物池状态

在当前版本的 `_G.DROP_RELIC_LIST` 中：

```lua
-- "item_free_ban",
```

被注释掉了。

位置：`addon_game_mode.lua:1090-1095`。

所以：

- 道具定义和处理逻辑仍然存在；
- 但当前版本未必能从普通随机圣物池取得；
- 任务、特殊发放或其他路径仍可能引用该道具。

## 24. 亡灵的特殊情况

Panorama 屏蔽列表明确排除：

```javascript
if (synergy == 'is_undead') {
    continue;
}
```

相关位置：

- `dac.js:4281-4282`
- `dac.js:4471-4474`

因此普通前端界面不会让玩家主动选择屏蔽亡灵。

与此同时，普通抽牌函数中还存在一段临时规则：

```lua
if table_ban_chess == nil
   or table.maxn(table_ban_chess) == 0 then
    -- 自动抽的暂时屏蔽亡灵
    table_ban_chess =
        _G.chess_list_by_synergy_black_and_pandaman[
            'is_undead'
        ]
end
```

位置：`addon_game_mode.lua:16643-16646`。

这属于招募过程中的临时候选过滤，不是玩家付费设置的：

```lua
hero.synergy_banned
```

两者不能混为一谈。

## 25. 两类 `ban_chess_list` 不要混淆

代码中存在名称相似但用途完全不同的数据。

### 25.1 全局羁绊屏蔽信息

```lua
_G.ban_chess_list
```

结构：

```lua
_G.ban_chess_list[synergy] = {
    chess_list = {...},
    ban_price = 价格,
}
```

用途：

- 保存羁绊对应棋子；
- 保存屏蔽价格；
- 提供给 Panorama 展示；
- 提供给服务端扣费校验。

### 25.2 玩家最近刷新重复抑制列表

```lua
h.ban_chess_list
h.ban_chess_list2
```

刷新旧商店时，未购买棋子会返还公共池，并被加入：

```lua
table.insert(h.ban_chess_list, chess.chess)
```

位置：`addon_game_mode.lua:4397-4417`。

这些列表用于减少刚刷走的棋子立即再次出现的情况。

它们不是玩家选择的种族/职业屏蔽，与：

```lua
hero.synergy_banned
```

不是同一种机制。

## 26. 前端价格字段不一致

列表渲染时使用正确字段：

```javascript
var price = ban_info[synergy].ban_price || 999;
```

位置：`dac.js:4486`。

但确认函数中读取：

```javascript
var price = Math.round(
    ban_info[synergy].price || 999
);
```

位置：`dac.js:4525`。

这里使用了 `.price`，而服务端发布的字段是 `.ban_price`。

可能造成：

- 客户端 `BAN_PRICE` 回退成 `999`；
- 确认界面的局部价格数据不准确。

但不会导致服务端错误扣费，因为服务端完全忽略客户端上传的价格，并重新读取：

```lua
_G.ban_chess_list[synergy].ban_price
```

## 27. 服务端参数校验隐患

服务端直接执行：

```lua
local price = _G.ban_chess_list[synergy].ban_price or 999
```

位置：`addon_game_mode.lua:30543-30544`。

但在这之前没有明显检查：

```lua
_G.ban_chess_list[synergy] ~= nil
```

如果异常客户端提交一个不存在的 `synergy`，可能发生对 `nil` 取字段的问题。

更稳妥的写法应类似：

```lua
local ban_info = _G.ban_chess_list[synergy]
if ban_info == nil then
    return
end

local price = ban_info.ban_price
if price == nil or price <= 0 then
    return
end
```

这是健壮性问题，不改变正常客户端操作时的机制结论。

## 28. 场景示例

假设玩家 8 级，屏蔽猎人羁绊。

执行过程：

```text
玩家支付猎人羁绊对应的屏蔽费用
  → hero.synergy_banned = "is_hunter"
```

下一次生成商店中的某一个槽位：

```text
先按 8 级概率抽费用档位
  │
  ├─ 20%：一费
  ├─ 30%：二费
  ├─ 32%：三费
  ├─ 17%：四费
  └─ 1%：五费
       │
       ▼
从对应费用公共池抽具体棋子
       │
       ├─ 属于猎人
       │    └─ 返回 nil，不从公共池扣除，继续尝试
       │
       └─ 不属于猎人
            └─ 从公共池移除一份并放入商店
```

所以屏蔽猎人不会提升四费或五费档位本身的概率，但会减少各费用档位内可能出现的猎人候选，使其他棋子的相对出现率提高。

## 29. 最终结论

羁绊 Ban 可以简化理解为：

```text
付费购买一个仅针对自己的搜牌排除条件
```

完整规则如下：

1. 屏蔽对象是一个种族或职业羁绊；
2. 一名玩家同时只能设置一个活动屏蔽；
3. 价格根据该羁绊当前包含的可屏蔽棋子种类数计算；
4. 尚未揭示的传奇棋子暂不进入初始列表和价格；
5. 客户端负责展示和提交羁绊，服务端负责最终定价和扣费；
6. 屏蔽记录保存在 `hero.synergy_banned`；
7. 招募时先确定费用档位，再过滤具体棋子候选；
8. 被过滤候选不会从公共棋池扣除；
9. 屏蔽不影响其他玩家，也不直接改变公共棋池；
10. 屏蔽不删除场上或候补区已有棋子；
11. 屏蔽不会追溯清除 Ban 前已经生成的当前商店；
12. 普通解除操作免费，但不会返还最初支付的屏蔽费用；
13. 狱卒的钥匙可使新屏蔽免费，或返还已经支付的屏蔽费用；
14. 普通前端界面明确不提供亡灵屏蔽选项；
15. `_G.ban_chess_list` 与 `h.ban_chess_list`/`h.ban_chess_list2` 是两套不同机制。

最简模型：

```text
选择羁绊并付费
  → 记录个人屏蔽条件
  → 等级概率照常确定费用
  → 从该费用公共池抽候选
  → 命中被屏蔽羁绊则拒绝并重抽
  → 允许的候选才正式出池并进入商店
```
