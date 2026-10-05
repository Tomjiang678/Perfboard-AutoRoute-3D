# Tools

`import-kicad-symbols.mjs` 是引脚模型库的**唯一生成入口**：从 KiCad 符号库读取物理脚号，重新生成 `apps/web/src/features/import/pinLibraryGenerated.json`。app 运行时的器件引脚模型（引脚名富化、电源脚识别）**只读取这一个文件**。

`pinLibraryOverrides.json` 已**弃用**：app 不再加载它，只作为历史存档保留。**不要再往里写映射**，新的引脚模型应通过 `import-kicad-symbols.mjs` 重新生成到 `pinLibraryGenerated.json`。

以下工具是 Multisim 时代的遗留，都写入已弃用的 `pinLibraryOverrides.json`，**不再影响 app 行为**，仅供存档参考：

- `add-pin-model.mjs`：根据 Multisim 交叉报告、全脚接地网表和 `%p/%t` 模型生成本地引脚覆盖映射。
- `add-kicad-override.mjs`：用 KiCad 符号库的物理脚号辅助生成 override（写入已弃用文件）。
- `add-import-json.mjs`：直接追加 JSON 到已弃用的引脚库或行为规则库。
