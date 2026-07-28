# Tools

`import-kicad-symbols.mjs` 只保留为离线实验工具；当前 app 不读取 `pinLibraryGenerated.json`，正式引脚映射只写 `pinLibraryOverrides.json`。

`add-pin-model.mjs` 用来根据 Multisim 交叉报告、全脚接地网表和 `%p/%t` 模型生成本地引脚覆盖映射，运行 `node tools/add-pin-model.mjs` 后按提示输入，模型可用 `:clip` 从剪贴板读取，结果写入 `apps/web/src/features/import/pinLibraryOverrides.json`。

`add-kicad-override.mjs` 用 KiCad 符号库的物理脚号辅助生成本地 override，运行 `node tools/add-kicad-override.mjs --device 74LS138` 后按提示把每个 KiCad 引脚对应到 Multisim 引脚名。若 `pinLibraryOverrides.json` 已有匹配项会自动停止，需要覆盖时加 `--force`。

`add-import-json.mjs` 用来直接追加 JSON：`--type pin-model`/`pin-template` 写引脚映射库，`--type ignored-rule`/`simple-rule` 写导入行为规则库；输入来源可用 `--json`、`--file` 或 `--clipboard`，例如 `node tools/add-import-json.mjs --type simple-rule --clipboard`。
