# ProtoRoute 3D

ProtoRoute 3D 是一个面向洞洞板和免焊面包板的 3D 元件布局、自动布线与连通性检查工具。它读取 KiCad 网表，将逻辑元件映射为可放置的物理封装，并在 2.54 mm 孔距的板模型上生成布局、走锡或跳线方案。

项目提供浏览器版和 Windows Electron 桌面版。当前核心实现均位于 `apps/web`，无需启动 Python 后端。

> 本项目不是完整的 PCB EDA，也不能代替制作前的人工复核。自动布局和自动布线采用启发式算法，复杂电路可能仍需手工调整。

## 已实现功能

### 板型与 3D 工作区

| 能力 | 洞洞板 | 免焊面包板 |
| --- | --- | --- |
| 自定义尺寸 | 宽、高各 5～150 孔 | 5～150 排，支持 1～8 块组合 |
| 板内固有连接 | 无 | 端子排五孔连通，并建模电源轨与中缝 |
| 自动布线 | 反面走锡与跳线 | 利用板内连接并生成正面跳线 |
| 手工布线 | 走锡、跳线、删线 | 跳线、删线 |
| 底面视图 | 支持 | 不适用 |

- Three.js 3D 视图可显示板孔、元件、引脚、走锡、跳线和 DRC 标记。
- 支持选择、拖动、旋转、放置/移除元件，以及单独弯折可调引脚。
- 支持网络和引脚高亮、透明板视图、深色模式、撤销和可配置快捷键。
- 面包板会校验一孔一线、DIP 跨中缝、两脚元件跨中缝、电源轨网络等物理规则。

### 网表导入与元件映射

- 导入器支持 KiCad Eeschema 导出的 S-expression `.net` 网表，也支持嘉立创 EDA / 立创EDA 导出的 Protel 2 网表（`.net`）：按内容自动识别（文件头 `PROTEL NETLIST`，缺失时按 `DESIGNATOR` 块结构兜底），无需转换；文件选择器同时接受 `.txt` 后缀的文本。
- Protel 网表没有库字段，导入时按位号前缀与值/封装关键词推断元件类别，并从内置器件引脚模型补齐引脚名与电源脚；推断不出封装的元件仍走回退封装并给出警告。
- 可同时导入多个网表，也可重新导入或移除文件；界面会显示元件、网络、节点、已映射引脚和缺失引脚统计。
- 从网表中的 `libparts`、封装和引脚信息生成物理元件，并通过生成的 KiCad 引脚模型库补充引脚名称和电源脚信息。
- 无法精确识别的器件会使用回退封装并给出警告，不会静默假定映射正确。
- 内置参数化元件包括电阻、电感、二极管、LED、电容、DIP、排针、晶体管/稳压器封装、继电器、开关、数码管、端子、蜂鸣器和电位器等。

### 自动放置

- 可指定自动放置区域；面包板会自动使用完整板宽。
- 根据网络关系、元件尺寸、板边和拥挤度生成初始布局，再以实际候选布线结果参与布局优化。
- 支持元件区域、靠边、相邻、锁定、方向、禁布区、电源母线和网络跳线数量等约束。
- 自动放置运行在 Web Worker 中，界面可显示阶段、进度和当前诊断信息，也可中途取消。

### 自动布线与 DRC

- 洞洞板使用带拥塞、转弯和引脚保护代价的 A* 搜索，优先生成反面走锡。
- 支持引脚逃逸、同网络路径复用、多轮搜索以及有限的 rip-up and reroute。
- 跳线是参与路径评分的高成本候选，不仅是走锡失败后的无条件兜底。
- 面包板布线会利用已有端子排/电源轨连通关系，只生成允许的正面跳线。
- 自动布线后会基于实际连接图复查结果；也可单独运行 DRC。
- DRC 覆盖未连接引脚、异网短路、走线交叉/重叠、无效孔位、孔位占用、跳线端点冲突、面包板放置规则和可疑 IC 相邻脚短接等问题。
- 自动布线后仍可手工补走锡、加跳线或删线；手工线路会作为锁定线路参与后续自动布线。
- 支持**清除布线**（`布线 -> 清除布线`）：清空走锡、跳线与 DRC 标记，保留元件与摆放；`Project -> 清空工程` 会连元件一起清掉。两者都带确认，也都可以撤销。

### AI 自然语言约束助手

AI 助手用于把自然语言设计意图转换为受限的结构化约束，例如“把接口放到右侧”“让去耦电容靠近 U1”或“该区域不要放元件”。它不会直接执行任意代码，也不会直接生成不可审查的线路。

处理流程为：

1. 将板尺寸、已有元件、网络和受支持的约束 Schema 发给所配置的模型。
2. 校验模型返回的 JSON；第一次格式错误时会自动请求一次修复。
3. 将结果解析为待确认草案，并检查不存在的位号、网络、越界区域和硬约束冲突。
4. 用户确认后，约束才会参与自动放置或自动布线。

界面提供 OpenAI、Anthropic、Gemini、DeepSeek、通义千问、智谱、豆包、Kimi 和自定义 API 预设。用户需要自行提供请求地址、API Key 和模型名；项目不附带任何 API Key。

注意：

- AI 约束编辑器目前只在洞洞板自动放置窗口中提供。
- 浏览器版把 AI 配置保存在当前浏览器的 `localStorage`，并可能受到目标 API 的 CORS 限制。
- Electron 版通过主进程请求 API，并使用系统 `safeStorage` 加密保存 API Key；系统无法提供安全加密时会拒绝保存。

## 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm
- Windows 桌面打包需要可用的 Electron Builder 环境

## 运行网页版

从仓库根目录进入 Web 项目：

```powershell
cd apps/web
npm.cmd ci
```

启动开发服务器：

```powershell
npm.cmd run dev
```

浏览器访问：

```text
http://127.0.0.1:5173
```

生产构建与本地预览：

```powershell
npm.cmd run build
npm.cmd run preview
```

构建产物位于 `apps/web/dist`。

## 运行和打包桌面版

以下命令均在 `apps/web` 目录执行。

构建前端并启动 Electron：

```powershell
npm.cmd run electron
```

生成 Windows 目录版应用：

```powershell
npm.cmd run dist:win
```

默认输出目录为：

```text
apps/web/release/win-unpacked
```

运行 `ProtoRoute 3D.exe` 时必须保留整个 `win-unpacked` 目录，不能只复制单个 EXE。

## 基本使用流程

1. 从 `Project -> New` 创建工程，并选择 `Perfboard` 或 `Breadboard`。
2. 在左侧 `Import` 区域导入 KiCad `.net` 网表。
3. 检查 `Mapped`、`Missing` 和导入警告，确认引脚映射结果。
4. 在 `自动 -> 生成元件` 中将网表器件加入板面；也可以从顶部元件库手工添加元件。
5. 手工调整元件，或打开 `自动 -> 自动放置` 设置区域和约束后运行自动放置。
6. 运行 `自动 -> 自动布线`，再根据需要使用走锡、跳线和删线工具修正结果。
7. 运行 `检查 -> DRC检查`，处理错误、警告和失败网络。
8. 点击右上角保存按钮导出 `.json` 工程；之后可通过 `Project -> Open` 重新打开。

## 工程保存

- 当前工程会在变更后自动保存到浏览器 `localStorage`，刷新页面后自动恢复。
- 设置和快捷键保存在独立的本地存储项中。
- 右上角保存按钮导出带缩进的 JSON 工程文件。
- Electron 桌面版支持直接打开作为启动参数传入的 `.json` 工程文件，并使用单实例窗口接收后续打开请求。
- 工程文件包含板型、导入结果、元件、线路、约束和 DRC 状态。打开旧工程时会迁移缺失的约束字段和旧板型定义。

## 测试

在 `apps/web` 目录运行：

```powershell
npm.cmd test
```

测试覆盖网表解析、引脚映射、板模型、面包板节点复用、元件放置、约束、自动布线、跳线、DRC、工程状态迁移和端到端流程。

## 项目结构

```text
apps/web                 当前可运行应用：React、Three.js、算法与 Electron 壳
apps/web/src/features    板模型、导入、放置、布线、约束和 AI 功能
apps/web/tests           当前自动化测试
apps/desktop             早期桌面方案占位说明；实际 Electron 入口在 apps/web/electron
backend                  预留的 Python 包结构，当前未接入运行流程
data                     器件、封装和示例数据的预留目录
docs                     架构记录、设计文档和测试网表
examples                 示例电路说明
packages                 预留的共享包目录，当前算法尚未拆分到这些包
tools                    KiCad 引脚模型生成工具及已弃用的 Multisim 辅助工具
```

主要实现入口：

```text
apps/web/src/App.tsx                               应用状态与操作入口
apps/web/src/features/board                        洞洞板/面包板模型与规则
apps/web/src/features/import/kicadNetlistParser.ts KiCad 网表解析
apps/web/src/features/import/protelNetlist.ts     嘉立创 / Protel 2 网表解析
apps/web/src/features/layout/autoPlacement.ts      自动放置与布局优化
apps/web/src/features/routing/autoRouter.ts        自动布线与 DRC
apps/web/src/features/constraints                  结构化约束解析与执行
apps/web/src/features/ai                           AI 约束客户端与提示词
apps/web/src/renderer3d/parametricComponents.ts    参数化 3D 元件
```

引脚模型库的当前生成入口是 `tools/import-kicad-symbols.mjs`。`pinLibraryOverrides.json` 以及写入该文件的 Multisim 辅助脚本已经弃用，不再影响应用运行；详见 [`tools/README.md`](tools/README.md)。

## 当前限制

- 当前只实现了 KiCad S-expression 网表与 Protel 2 网表（嘉立创 / 立创EDA）；规划文档中提到的 BOM、SPICE、Multisim 报告和 `.ms14` 导入尚未接入应用。
- `backend`、`packages` 和 `data` 中有多处为未来拆分预留的目录，不能视为已经启用的独立后端或软件包。
- 自动放置和自动布线是面向项目的启发式实现，不保证得到全局最优解或完成所有复杂网络。
- 3D 元件是按封装类别生成的参数化模型，不追求具体厂商型号的外观还原。
- AI 约束依赖第三方 API 的可用性、接口兼容性和返回质量；使用前应检查草案及最终 DRC 结果。
- Electron 目录版体积较大，这是捆绑 Chromium 和 Node.js 运行时带来的正常开销。

## 许可证

本项目采用 [MIT License](LICENSE) 开源。使用、修改或分发时请保留原始版权声明和许可证声明。
