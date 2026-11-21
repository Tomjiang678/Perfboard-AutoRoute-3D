# Multisim 导入支持计划（设计稿 v3 + 实施进度）

> 状态：核心链路已实施（2026-11-19），提交端点与合并工具待部署。
> 时间：2026-11-18 设计；2026-11-19 落地
> 关联：`README.md`、`docs/后续计划与改进.md`（脚数判定 P0）、`tools/README.md`

---

## 0. 实施进度（2026-11-19）

已完成（代码在 `apps/web/src/features/import/multisim/`）：

| 能力 | 位置 |
|---|---|
| 结构嗅探 + 网表/交叉引用解析（`_uc` 表头、`U1A` 单元、脏位号、电源符号） | `multisimReport.ts` |
| 类别翻译（OPAMP/RESISTOR/… → KiCad 风格类别） | `multisimCategory.ts` |
| 脚数推断（封装名，含 `PDIP-P-8`）与"数字同名直通" | `pinCountInference.ts`、`../pinCount.ts` |
| 未解决型号清单（按 value+package 聚合） | `pending.ts` |
| 单屏映射工作台（脚数 / 逻辑脚 / 空闲脚接已有网络） | `components/PinProfilesDialog.tsx` |
| 用户 profile 校验与生成 | `profileBuilder.ts` |
| 项目内 profile + 本地"我的库" | `library.ts`、`ImportState.pinProfiles` |
| 逻辑脚解析与空闲脚合成节点 | `pinResolver.ts` |
| 静默回流队列（内容哈希去重、离线保留） | `submit.ts` |
| 分两次导入时的警告清理与电源符号节点回收 | `importWarnings.ts`、`normalizeImport.ts` |
| 元件库“公用 / 用户”页、用户配置删除 | `ComponentLibrary.tsx`、`PinProfileLibraryList.tsx` |
| 提交接收端点 + nginx/systemd 参考配置 | `deploy/pin-profile-server.mjs`、`deploy/pin-profile.nginx.conf` |
| 提交合并/去重/冲突报告 | `tools/merge-pin-profiles.mjs`、`mergeSubmissions.ts` |
| 内置库加载（合并结果随包发布） | `multisimProfiles.json`、`library.ts` |
| 已保存 profile 的修改入口 | `ProjectSidebar.tsx`、"Pin profiles" 区块 |
| 解析/脚数/回流/合并回归测试 | `tests/multisimImport.test.ts`、`tests/submissionQueue.test.ts`、`tests/mergePinProfiles.test.ts` |

实测：真实样例（`060915c` 里的 `try1-网表.txt` + `try1-交叉引用报告.txt`）解析出 15 个元件、14 个网络、0 警告；待补充 3 个型号（1N4149、2N1711、TL062IP），电阻/电容自动识别；补齐 TL062IP 后生成 12 个元件，`Mapped 33 / Missing 7`（仅剩未补映射的二极管与三极管）。

尚未完成：

1. `/admin` 待审页面（目前用 `merge-pin-profiles` 的报告人工审核）；
2. 未用通道批量接 GND/电源等 P5 增强。

> 2026-11-20 调整：`pinLibraryOverrides.json` 不再删除，改作**内置 Multisim 型号库**（value 正则 → 逻辑脚/单元/电源脚）。TL06x、LM358、LM324、LM393、NE555、74xx、LM317、IRF540、2N3904/3906、OP07、数码管等老型号由 `builtinPinModels.ts` + `builtinProfiles.ts` 自动解析，用户 profile 优先；不再需要人工补录。

## 1. 一句话流程

**拖入网表 + 交叉引用 → 系统认出哪些型号不认识 → 一个界面里补齐"几脚 / 引脚对应 / 空闲脚接哪个已有网络" → 自动保存、自动回流，然后照常放置布线。**

不认识的器件不做半残导入，也不静默猜；用户补齐后立刻可用。

## 2. 目标与非目标

目标：

1. Multisim 文本报告直接导入（网表 + 交叉引用，最少两个文件）。
2. **复用旧型号库**：`pinLibraryOverrides.json` 作为内置 Multisim 型号库（只读），覆盖之前支持的所有型号；用户 profile 优先于它。
3. 未知元件由一个**单屏工作台**补齐：物理脚数 N、逻辑名↔物理脚、空闲脚挂到哪个网络。
4. 用户创建/修改的型号信息**创建即回流**，逐步长成共享库。
5. KiCad / Protel 两条既有链路行为不变；脚数子系统顺带修 Protel 的 bug。

非目标：`.ms14` 解析、按型号自动猜引脚顺序、为回流跑重后端、把用户设计数据传出本机。

## 3. 核心概念

- **N（物理脚数）**：器件占几个孔。14 脚 DIP 就是 14，哪怕只用了 2 个脚。
- **逻辑引脚**：Multisim 符号上的名字（`A`、`Y`、`1OUT`、`VS+`）。
- **空闲引脚**：`1..N` 里没有被逻辑名占用的脚（未用通道、NC、电源脚）。
- **挂接（binding）**：把某个空闲脚接到网表里**已经存在**的网络（如 `0 (GND)`、`VCC`）。

`pinCount = N`，映射只覆盖子集；空闲脚不接就不参与布线，接了就是该网络的一个新端点。

## 4. 单屏映射工作台（核心交互）

### 4.1 触发与范围

- 导入完成后，如果存在未知型号，工作台**自动打开**（也可以从"待补充"清单点进来）；
- 只列**未知型号**，每个型号一张卡片，按型号聚合（`U1/U2/U3` 共用一张）；
- 已知型号完全不出现，不占注意力；
- 没有未知型号时，什么都不弹。

### 4.2 一张卡片 = 你描述的五步，但可乱序

以非门为例（Multisim 符号只有 `A`/`Y`，实际 14 脚 + 电源脚 + 未用通道）：

```
┌ 74HC04 · DIP-14 · U1, U2, U3 ───────────────────────────┐
│ ① 这是几脚    [ 14 ]   （封装建议 14 · 请确认）          │
│                                                        │
│ ② 引脚对应    网表里用到：A、Y                          │
│     A（单元 A） → [ 1 ]      Y（单元 A） → [ 2 ]        │
│                                                        │
│ ③ 空闲脚（12 个）                                       │
│     7  [电源]  → [ 0 (GND) ▾ ]   ← 建议：GND           │
│     14 [电源]  → [ VCC ▾ ]       ← 建议：VCC           │
│     3–6, 8–13 [未用通道/NC] → [ 不接 ▾ ]  [全部不接]    │
│                                                        │
│ ④ 校验：2 个电源脚已挂接；其余空闲脚不接                 │
│ ⑤ [保存并应用]  [跳过此型号]                            │
└────────────────────────────────────────────────────────┘
```

特点：

- **没有上一步/下一步**。任意顺序填，实时校验，随时保存；
- 每一步都有默认值/建议：N 从封装来、数字同名直通、电源脚按名字匹配网表网络（`VS+/VCC/VDD → VCC`，`VS-/VEE → VDD/VEE`，`GND/0 → 0`）；
- 建议只是建议：带"建议"标记，用户可改；
- 可粘贴一段文本一次填完（`1 A` / `2 Y` / `7 GND`），适合熟手；
- 卡片之间互不阻塞，可以只处理一个、其余"跳过"（跳过的型号保持 blocked，绝不半猜）。

### 4.3 为什么不是向导

向导会强迫用户按固定路线走，而真实情况是：有人只想先填 N 让元件摆上去，有人拿到数据手册想一次填全，有人只想改一个电源脚。单屏 + 卡片 + 预填建议，把"顺序"变成"默认值"，用户只在需要的地方动手。

## 5. 脚数 N

### 5.1 来源与规则

| 顺序 | 来源 | 行为 |
|---|---|---|
| 1 | 用户填写 | 权威 |
| 2 | 封装名建议 | `PDIP-P-8 → 8`、`DIP-14 → 14`（需补 `-?P?-?` 解析，实测当前解析不出），作为输入框默认值，必须确认 |
| 3 | 无 | `unknown`：不放置，进"待补充脚数" |

- **下界**：`N >= 网表里出现过的最大物理脚号`，违反就报错（不取 max 糊过去）。
- **禁止**用"网表里出现几个逻辑脚"推 N（嘉立创 8 脚芯片被认成 2 脚的根因）。
- **改 N 的后果**：几何变化 → 重建受影响元件 → 清除相关走线 → DRC 标记过期；必须确认，不静默。
- 只填 N、不填映射：允许放置（几何正确），涉及网络 blocked，DRC 明说"缺引脚映射"。

### 5.2 为什么先说 N

```
N ──► pinOffsets 几何 ──► 放置合法性 ──► 布线端点 ──► DRC
```

N 错，后面全错且看起来正常。所以元件上要显示 N 的来源（用户填写 / 按封装推断 / 未知）。

## 6. 空闲脚与"接到已有网络"

### 6.1 只允许挂到已有网络

- 下拉框内容 = 当前网表里**已经存在**的网络（`0 (GND)`、`VCC`、`VDC5`…），不提供"新建网络"；
- 为什么：新建一个网络名对布线没有意义（没有第二个端点）；挂到已有网络才是"这根脚和那些脚同电位"；
- 可选项还有 `不接`（默认）。

### 6.2 数据与解析

```json
{
  "physical": 7,
  "connection": "bound",
  "net": "0",
  "role": "power"
}
```

- `connection`: `netlist`（网表决定）/ `bound`（用户挂接）/ `unconnected`（不接）；
- `bound` 的脚在**派生阶段**生成一个合成节点：`{ ref, pin: 7, net: "0", source: "user-binding" }`；
- 合成节点只活在派生数据里，不写回文件解析结果；改/删 profile 时重新派生即可，天然可撤销；
- 如果目标网络在网表里只有一个端点，加进来后变成两个，就能布线；只有一个端点时布线器不会硬连（照常缺失）。

### 6.3 建议规则（只用网表自己的网络名，不查库）

| 逻辑名/角色 | 建议匹配 |
|---|---|
| `GND / GROUND / VSS / 0` | 网络名归一后等于 `0/GND/GROUND/VSS` |
| `VCC / VDD / VS+ / V+` | `VCC/VDD/VDC*` |
| `VEE / VS- / V- / VSS-` | `VEE/VSS/VDD`（负电源优先 `VEE`） |
| 未用通道输入 | 不自动建议；卡片提供"该单元全部接 GND"的批量按钮（P5） |

没有匹配到 → 默认 `不接` + 软警告"电源脚未接，实物可能不工作"。

### 6.4 回路、短路与 DRC

- 挂接是显式用户行为，必须在导入报告里留痕："用户挂接：U1.7 → 0 (GND)"；
- DRC 正常检查（同网络多端点、短路、占孔）不变；
- 若用户把电源脚挂到信号网络，DRC 会按普通网络处理——需要一条"电源脚接到非电源网络"的软警告；
- 网表完整性检查（`findUnmappedNetNodes`）要认识合成节点，不能报"缺节点"。

## 7. 不支持怎么标

状态（按型号聚合，展开到实例）：

```ts
type SupportStatus =
  | { kind: "resolved"; via: "user" | "numeric_identity" }   // numeric_identity = 逻辑名就是 1,2,3
  | { kind: "needs_pin_count" }
  | { kind: "needs_pin_map"; pinCount: number; missing: Array<{ unit?: string; logical: string }> }
  | { kind: "ignored"; reason: "user" | "power_symbol" | "bad_ref" };
```

导入结果：

```
已识别 6   用户配置 2   待补充 2   已忽略 3
74HC04 · DIP-14 · U1,U2,U3 · 待补充引脚对应（网表用到 A、Y）
[补充] [先按 14 脚占位] [忽略]
```

## 8. 创建即回流（隐私权衡）

### 8.1 你要的行为

用户在工作台保存一个型号 → **后台自动提交**，不需要额外点击、不需要账号、不打断流程。

### 8.2 已定方案：完全静默

按要求不做任何提示性小字、不做开关。提交发生在"保存一个型号"时，后台入队并发送，失败静默重试，不打断编辑。

安全边界仍然保留：

- payload 只含型号身份（value + package）、脚数、物理脚表；**不含**网表、网络名、位号、工程名、文件名、备注、IP；
- `contentHash` 完全相同的重复保存只算一次；
- 端点不可达时留在本地队列，最多 50 条，联网后补发。

### 8.3 Payload（最小化）

```json
{
  "kind": "protoroute.pin-profile",
  "schemaVersion": 1,
  "submissionId": "uuid",
  "contentHash": "sha256(canonical profile)",
  "createdAt": "2026-11-18",
  "appVersion": "2.0.0",
  "profile": {
    "identity": { "value": "74HC04", "package": "DIP-14" },
    "pinCount": 14,
    "pins": [ { "physical": 1, "unit": "A", "logical": "A", "connection": "netlist" } ]
  }
}
```

**不含**：网表、网络名、工程名、文件名、位号、备注自由文本、IP、机器码。`createdAt` 只到日。

### 8.4 端点（复用现有 nginx 思路）

```
app ──POST /api/pin-profile──► nginx（limit_req + 4KB 上限）──► 追加 jsonl
                                                                  └─► cron/合并工具 → /admin 待审
```

- 纯 nginx 想可靠落盘 POST body 需要 `$request_body`/临时文件，行为容易踩坑；更稳的是**一个几十行的追加写服务**（systemd + Python 标准库），和"不引入常驻服务"的部署哲学有一点冲突，但比在 nginx 里拼日志更可靠；
- 如果想零服务：把 JSON base64 后走 GET 查询串，复用现有 `/api/hit` 日志管线（受 URL 长度限制，单条够用，批量要分片）；
- 防滥用：按 IP 限速、4KB 上限、字段白名单、`pinCount <= 64`、字符串长度上限；不落原始 IP。

### 8.5 去重与审核

- `contentHash` 完全相同 → 只计数 `confirmations++`，不重复入库；
- 同一 `identity` 不同内容 → 两边都留，写 `conflicts.md`，**不自动裁决**；
- 准入：有数据手册链接，或 ≥2 份独立一致提交 → 标 `verified: true` 进内置库；否则只算候选；
- 任何提交都不直接进用户安装包，随版本发布。

## 9. 解析与合并

| 报告 | 提供 | 必需 |
|---|---|---|
| 网表 | 网络 + 节点（位号.逻辑脚） | 是 |
| 交叉引用 | 位号、型号、类别、封装 | 是 |
| 真实/虚拟元器件 | 汇总 BOM、封装线索、电源符号 | 第二期 |
| 多余门电路 | 未使用单元 | 第二期（仅提示） |

- 嗅探顺序：`Protel → Multisim（RefDes 表头 + 横线 + 四列）→ KiCad`；Multisim 文本不是 S-expression。
- 一次导入 = 一个 bundle，文件列表按 bundle 展示/删除，避免"删了交叉引用、网表还在"。
- 已知陷阱：`_ucXXXX` 乱码表头（按结构识别）、`U1A` 单元后缀（归一 `U1` + unit）、脏位号 `_uc257307ebf`（丢弃 + `bad_ref`）、网络名 `0` 是地、电源符号是独立元件（按类别过滤）、网表只含有连线的脚（所以必须让用户选 N）。

## 10. 数据模型

| 位置 | 改动 | 兼容 |
|---|---|---|
| `types/project.ts` | `ParsedComponent` 加 `pinCount?`、`pinCountSource?`、`support?`；`NetNode` 加 `unit?`、`logicalPin?`、`source?: "netlist" \| "user-binding"`；`PerfboardProject` 加 `pinProfiles?` | 全可选 |
| `PlacedComponent` | 加 `pinCountSource?`、`pinProfileId?` | 可选 |
| `projectValidation.ts` | 允许新字段缺省 | 旧校验不变 |
| `importConfig.ts` | 脚数改为"证据 + 下界 + 冲突" | 修 Protel 老问题 |
| `componentMapping.ts` | 不再数 `pinInfo` 键 | — |
| 新增 | `multisimReportParser.ts`、`profileStore.ts`（派生/合成节点）、`mappingWorkbench` 组件 | — |

## 11. 分阶段

### P0 脚数子系统（不碰 Multisim，先做）
证据模型、`PDIP-P-8` 解析、冲突警告、来源徽标、老工程兼容。
**验收**：P0 五条矩阵全过；Protel/KiCad 结果不变或变好。

### P1 解析 + 未知检测
嗅探、解析、bundle、`U1A→U1`、脏行/电源符号过滤、类别映射、`needs_pin_count/needs_pin_map` 标注。
**验收**：5 个样例解析正确；全部未知型号出现在清单里。

### P2 单屏工作台 + 空闲脚挂接
N 选择、两视图、三态连接、网络下拉（只列已有网络）、建议规则、合成节点、校验、保存、项目/我的库双存、改 N 重建。
**验收**：非门例子（A/Y→1/2，7→0(GND)，14→VCC）保存后 14 脚、7/14 成为对应网络端点并能布线；同型号多实例一次生效；删 profile 后合成节点消失、走线失效提示；重启/换机不丢。

### P3 静默回流
队列、重试、去重、`contentHash`、一行告知、设置开关、`/api/pin-profile`、`tools/merge-pin-profiles.mjs`、`/admin` 待审。
**验收**：保存即入队并成功上传；断网不报错、联网补传；同一数据只计一次；关闭开关后不再发送；合并工具能去重并列出冲突。

### P4 内置型号库
保留 `pinLibraryOverrides.json` 作为只读内置型号库，由 `builtinPinModels.ts` 加载、`builtinProfiles.ts` 生成 profile；旧写入工具归入存档。新增测试覆盖全部 21 组老型号。

### P5（可选）
未用通道批量接 GND/电源、多余门报告提示"输入悬空"、电源脚接非电源网络的软警告。

## 12. 待拍板

1. 端点实现：几十行的追加写服务（建议），还是 GET + 现有日志管线（零服务）？
2. `contentHash` 相同只计数：够不够，还是每次都要留独立记录？
3. 空闲脚默认：`不接`（建议）还是按名字自动挂接（会替你决定电气连接）？
4. 内置库准入：数据手册链接或 ≥2 份一致提交（建议）？

## 13. 风险

| 风险 | 缓解 |
|---|---|
| 用户填错 N/映射，几何与布线全错 | 来源徽标、改 N 强制重建、DRC 警告、内置只收核验数据 |
| 用户把电源脚挂到错误网络 | 建议 + 软警告（电源脚→非电源网络）+ 导入报告留痕 |
| 无提示采集引发信任问题 | payload 不含设计数据/位号/IP；下载页隐私说明统一交代；数据只进人工审核队列 |
| 端点被刷 | 限速、大小上限、字段白名单、人工审核 |
| 没有内置库，首次每个 IC 都要填 | 按型号一次、可粘贴文本、可导入别人的 JSON |
| 合成节点让网表与工程不一致 | 派生层生成、可撤销、导入报告标注"用户挂接" |
