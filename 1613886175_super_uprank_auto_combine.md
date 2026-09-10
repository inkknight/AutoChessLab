# 启明星与自动合成的执行优先级

> 来源：`1613886175.vpk` 的 Source2Viewer 反编译结果。
>
> 核心文件：`1613886175_decompiled/scripts/vscripts/addon_game_mode.lua`

## 结论

在购买棋子时，服务端会**先判断并执行自动合成**。

如果玩家已经拥有至少两个满足合成条件的同名棋子，并且开启了自动合成，则本次购买会直接进入合成分支，**不会进行启明星的概率判定**。

```text
满足自动合成条件
  → 直接合成二星棋子
  → 跳过启明星判定
```

启明星只会在没有进入自动合成分支时进行判定。

## 1. 购买前先统计同名棋子

服务端购买入口：

```text
DAC:OnRequestBuyChess(keys)
```

位置：`1613886175_decompiled/scripts/vscripts/addon_game_mode.lua:26609`

购买前先查询玩家已有的同名棋子：

```lua
local have_exist_count, chess1, chess2, chess3 =
    Find2SameChessInHandOrOnBoard(h, chess, true)
```

位置：`addon_game_mode.lua:26654-26655`

查找函数位于：

```text
addon_game_mode.lua:19558-19616
```

它会检查候补区中的同名棋子；在准备回合剩余时间大于 5 秒时，还会检查可作为材料的场上棋子。

## 2. 候补区容量校验

服务端随后查找候补区空位：

```lua
local index = FindEmptyHandSlot(team_id)
```

位置：`addon_game_mode.lua:26657-26658`

如果候补区已满，处理规则是：

```lua
if index == nil and
   have_exist_count < 2 and
   h.is_auto_combine == 1 then
    -- 拒绝购买：候补区已满
    return
end

if index == nil and h.is_auto_combine ~= 1 then
    -- 拒绝购买：候补区已满
    return
end
```

位置：`addon_game_mode.lua:26659-26671`

因此，候补区满时只有同时满足以下条件才允许购买：

1. 已开启自动合成；
2. 已有至少两个符合要求的同名棋子。

这是因为本次购买可以直接参与合成，不需要长期占用新的候补区槽位。

## 3. 扣款发生在分支判断之前

通过余额和候补区检查后，服务端先扣款并清除商店槽位：

```lua
if money == nil or money == 'gold' then
    result = CostMana(h, price)
else
    result = CostToken(h, price, money)
end

h.curr_chess_table[buy_index] = nil
```

位置：`addon_game_mode.lua:26674-26687`

随后才进入“自动合成或启明星”的分支。

## 4. 自动合成分支优先

核心控制流：

```lua
if have_exist_count >= 2
   and chess1 ~= nil
   and chess2 ~= nil
   and h.is_auto_combine == 1 then

    CombineChessPlusAsync(
        { [1] = chess1, [2] = chess2 },
        chess .. '1',
        function(x)
            if IsUnitExist(x) then
                x.buy_price = x.buy_price + price
                RequestBuyChessInner(h, buy_item, x)
            end
        end
    )
else
    -- 启明星逻辑位于这里
end
```

位置：`addon_game_mode.lua:26717-26726`

满足自动合成条件后，服务端直接把：

```text
已有同名一星棋子 A
+ 已有同名一星棋子 B
+ 本次购买的一份棋子
```

合成为：

```text
一个同名二星棋子
```

本次新购买的一星棋子不会先创建为独立实体。

## 5. 启明星只在 else 分支判定

启明星判定代码位于自动合成分支的 `else` 内：

```lua
if h:HasModifier('modifier_item_super_uprank')
   and (money == nil or money == 'gold')
   and chess ~= 'chess_io' then

    local chesscost = GetChessCostByName(chess)
    if chesscost > 5 then
        chesscost = 5
    end

    local prob_table = {
        [1] = 25,
        [2] = 22,
        [3] = 19,
        [4] = 16,
        [5] = 13,
    }

    if RandomInt(1, 100) <= prob_table[chesscost] then
        local level_one_chess_table =
            string.split(h.level_one_chess, ',')

        if FindValueInTable(level_one_chess_table, chess) then
            chess = chess .. '1'
            -- 播放启明星特效与音效
        end
    end
end
```

位置：`addon_game_mode.lua:26726-26746`

由于它处于自动合成条件的 `else` 分支中，进入自动合成分支后不会执行这段代码。

## 6. 启明星的触发条件

只有同时满足以下条件，才会执行启明星随机判定：

1. 没有进入自动合成分支；
2. 玩家持有 `modifier_item_super_uprank`；
3. 购买使用金币，`money` 为 `nil` 或 `gold`；
4. 购买的棋子不是 `chess_io`；
5. 玩家已经拥有该棋子；
6. 随机数通过对应费用的概率判断。

概率表：

| 棋子费用 | 启明星触发概率 |
|---:|---:|
| 1 费 | 25% |
| 2 费 | 22% |
| 3 费 | 19% |
| 4 费 | 16% |
| 5 费 | 13% |

本地化说明位置：

- `1613886175_decompiled/resource/addon_schinese.txt:6623-6625`
- `1613886175_decompiled/resource/addon_schinese.txt:6734`

启明星成功后，代码把单位名从一星名称改为二星名称：

```lua
chess = chess .. '1'
```

随后调用：

```lua
CreateChessInHandAsync(h, chess, ...)
```

即直接创建二星实体。

## 7. 不同场景的实际结果

| 候补区 | 已有同名一星棋子 | 自动合成 | 购买结果 | 是否判定启明星 |
|---|---:|---:|---|---|
| 有空位 | 至少 2 个 | 开启 | 直接自动合成二星 | 否 |
| 已满 | 至少 2 个 | 开启 | 允许购买并直接合成二星 | 否 |
| 有空位 | 少于 2 个 | 开启 | 进入普通创建流程 | 是 |
| 有空位 | 任意 | 关闭 | 进入普通创建流程 | 是 |
| 已满 | 少于 2 个 | 开启 | 拒绝购买 | 否 |
| 已满 | 任意 | 关闭 | 拒绝购买 | 否 |

## 8. 典型场景

假设玩家当前拥有两个同名一星棋子，并且：

- 持有启明星；
- 开启自动合成；
- 候补区已满；
- 商店出现第三个同名棋子。

执行结果：

```text
检查到两个同名一星棋子
  → 满足满候补区购买豁免
  → 扣除购买费用
  → 进入自动合成分支
  → 将两枚已有棋子和本次购买合成为二星
  → 不执行启明星概率判定
```

不会出现：

```text
先触发启明星获得二星
  → 再与已有棋子合成
```

也不会出现：

```text
自动合成得到二星
  → 再判定启明星继续升级
```

## 9. 流程图

```text
购买商店棋子
  │
  ├─ 钱不够
  │    └─ 拒绝购买
  │
  └─ 钱足够
       │
       ├─ 查找候补区空位和已有同名棋子
       │
       ├─ 候补区满，且不满足自动合成
       │    └─ 拒绝购买
       │
       └─ 允许购买
            │
            ├─ 扣款并清除商店槽位
            │
            ├─ 已有至少两个同名棋子，并开启自动合成？
            │    │
            │    ├─ 是
            │    │    ├─ CombineChessPlusAsync()
            │    │    ├─ 直接生成二星
            │    │    └─ 跳过启明星
            │    │
            │    └─ 否
            │         ├─ 检查启明星
            │         ├─ 满足持有、金币购买、非 IO、已拥有条件？
            │         │    ├─ 否：创建一星
            │         │    └─ 是：按费用概率随机
            │         │         ├─ 成功：创建二星
            │         │         └─ 失败：创建一星
            │         └─ CreateChessInHandAsync()
```

## 10. 最终结论

> **自动合成优先级高于启明星。**

当玩家已拥有两个满足合成条件的同名棋子并开启自动合成时，无论候补区是否已满，购买都会直接走自动合成路径，启明星不会参与此次购买判定。

只有在本次购买没有触发自动合成路径时，服务端才会检查启明星，并按 1～5 费棋子的 25%/22%/19%/16%/13% 概率尝试直接创建二星棋子。
