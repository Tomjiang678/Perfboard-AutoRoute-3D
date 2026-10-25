# ProtoRoute 3D

面向洞洞板/万能板的 3D 元件放置、反面走锡、跳线规划和连通性检查工具。

本项目不是完整 PCB EDA。它的目标是把 netlist 和元件封装映射到洞洞板格点上，生成便于真实焊接的正面元件布局、反面走锡路径、跳线方案，并提供 3D 透视检查和 DRC 提示。

## 目前项目整体介绍

当前项目包含两个运行形态：

- 网页版：基于 Vite + React + Three.js，在浏览器中运行。
- EXE 版：基于 Electron，把同一套网页项目打包成 Windows 桌面程序。

核心能力：

- 创建自定义尺寸洞洞板，默认 `30 x 20`。
- 导入 netlist 和 BOM/元件信息。
- 解析逻辑元件到物理封装，包含 LM393/LM2903 等多单元芯片的物理引脚映射。
- 3D 显示洞洞板、元件、引脚、反面走锡和跳线。
- 自动放置元件。
- 自动布线：底面走锡优先，必要时生成反面拱形跳线。
- 手工编辑：手动增加走锡、跳线、删除线。
- DRC/连通性检查：未连接引脚、错误网络短接、底层走线交叉、边重叠、空脚提示、IC 相邻脚异常短接等。
- 浏览器本地自动保存，刷新页面后可恢复。
- 导出/打开 `.json` 工程文件。

## 算法关键信息

自动布线入口主要在：

```text
apps/web/src/features/routing/autoRouter.ts
```

关键辅助逻辑在：

```text
apps/web/src/features/routing/routingGeometry.ts
```

当前 autorouter 的核心思路：

- 格点建模：洞洞板孔位是节点，相邻孔之间的底面连接是 bottom edge。
- 占用模型：
  - `routeOwner`：孔位/格点占用。
  - `edgeOwner`：底层边占用。
  - `padOwner`：所有物理引脚孔占用，包括 no-net 空脚。
  - jumper 和 bottom route 分层处理。
- 引脚逃逸 fanout：DIP、排针、TO-92 等元件会先给引脚规划短逃逸段，降低芯片脚被横向封死的概率。
- A* 搜索：底面走锡使用带拥塞代价、转弯代价、引脚保护代价的 A*。
- 拥塞代价图：根据引脚密度、已有走线、板边缘和 rip-up 区域提高代价，避免线路都挤到同一区域。
- rip-up and reroute：布线失败时会尝试拆除低优先级阻挡网络后重布。
- 跳线策略：跳线作为高成本候选连接参与结果，不只是失败兜底。
- 强制校验：自动布线结束后调用连通性/DRC 检查，基于实际走线和跳线构建连接图。

当前算法仍是项目级 autorouter，不是工业级 EDA。复杂电路仍可能需要手工调整布局、走锡和跳线。

## 目录结构

```text
apps/web                 Web 前端、3D 视图、Electron 打包入口
apps/web/electron        Electron 主进程入口
backend                  预留 Python 后端目录，目前未接入主流程
docs                     项目说明和设计记录
examples                 示例电路
packages                 预留共享包/核心包目录
data                     器件、封装、示例数据预留目录
```

## 如何运行网页版

进入 Web 项目目录：

```powershell
cd apps/web
```

安装依赖：

```powershell
npm.cmd install
```

启动开发网页：

```powershell
npm.cmd run dev
```

浏览器打开：

```text
http://127.0.0.1:5173
```

构建网页发布文件：

```powershell
npm.cmd run build
```

构建结果在：

```text
apps/web/dist
```

预览构建结果：

```powershell
npm.cmd run preview
```

## 如何运行 EXE 版

进入 Web 项目目录：

```powershell
cd apps/web
```

安装依赖：

```powershell
npm.cmd install
```

开发模式打开桌面窗口：

```powershell
npm.cmd run electron
```

打包 Windows EXE：

```powershell
npm.cmd run dist:win
```

生成位置：

```text
apps/web/release/win-unpacked
```

双击运行：

```text
apps/web/release/win-unpacked/ProtoRoute 3D.exe
```

说明：这里使用的是稳定的目录版 EXE。整个 `win-unpacked` 文件夹需要一起保留，不能只单独复制 exe 文件。

如果以后需要单文件 portable EXE，可以把 `apps/web/package.json` 里的 `dist:win` 改成 `electron-builder --win portable`，但部分 Windows 环境需要管理员权限或开启开发者模式，否则会因为符号链接权限导致打包失败。

## 基本使用流程

1. 通过左上角 `Project` 选择 `New` 创建工程。
2. 在左侧 `Import` 导入 netlist 和 BOM。
3. 点击生成元件，从导入结果生成元件。
4. 点击自动放置，或从顶部元件库手动点击添加元件。
5. 点击自动布线，生成反面走锡和跳线。
6. 使用走锡、跳线、删线工具手工修正线路。
7. 查看左侧 Routing/DRC 中的错误和警告。
8. 点击右上角保存图标导出 `.json` 工程文件。
9. 通过 `Project -> Open` 打开导出的 `.json` 工程。

## 保存机制

- 页面会自动保存当前工程到浏览器 `localStorage`。
- 刷新页面会自动恢复上次工程。
- 右上角保存图标用于导出 `.json` 工程文件。
- `Project -> Open` 可重新打开导出的 `.json` 文件。

## 已知限制

- 自动布线质量仍有优化空间，复杂网络可能需要手工修线。
- 手工修线后应继续增强自动 DRC 复检和错误定位交互。
- Python 后端目前尚未接入，布线算法主要在前端 TypeScript 内运行。
- Electron EXE 体积会较大，这是 Electron 的正常代价。

## 许可证

本项目采用 [MIT License](LICENSE) 开源。你可以自由使用、复制、修改和分发本项目，但须保留原始版权声明和许可证声明。
