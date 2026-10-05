# Tools

`import-kicad-symbols.mjs` 只保留为离线实验工具；当前 app 不读取 `pinLibraryGenerated.json`，正式引脚映射只写 `pinLibraryOverrides.json`。

`add-pin-model.mjs` 用来根据 Multisim 交叉报告、全脚接地网表和 `%p/%t` 模型生成本地引脚覆盖映射。它既保留单元件交互模式，也支持任意报告路径和批量 TXT：

```powershell
# 交互输入报告文件/目录、批量 TXT 或单个元件
node tools/add-pin-model.mjs

# 同时读取指定的交叉报告和网表，并批量处理 TXT 中的所有元件
node tools/add-pin-model.mjs --input "D:\reports\交叉.txt" --input "D:\reports\网表.txt" --model-file "D:\reports\端口模型.txt"

# 先检查，不写入引脚库
node tools/add-pin-model.mjs --input "D:\reports" --model-file "D:\reports\端口模型.txt" --dry-run
```

批量文件可参考 `pin-model-batch.example.txt`。每个元件用 `[RefDes]` 或 `[型号]` 开头，下面直接粘贴完整模型；也支持 `U1 | x%p_a ...` 单行形式。默认仍写入 `apps/web/src/features/import/pinLibraryOverrides.json`，可用 `--output` 指定其他 JSON。多个报告路径既可重复写 `--input`，也可在交互输入时用分号隔开。只有明确不需要网表校验时才使用 `--no-net-check`。

`add-kicad-override.mjs` 用 KiCad 符号库的物理脚号辅助生成本地 override，运行 `node tools/add-kicad-override.mjs --device 74LS138` 后按提示把每个 KiCad 引脚对应到 Multisim 引脚名。若 `pinLibraryOverrides.json` 已有匹配项会自动停止，需要覆盖时加 `--force`。

`add-import-json.mjs` 用来直接追加 JSON：`--type pin-model`/`pin-template` 写引脚映射库，`--type ignored-rule`/`simple-rule` 写导入行为规则库；输入来源可用 `--json`、`--file` 或 `--clipboard`，例如 `node tools/add-import-json.mjs --type simple-rule --clipboard`。
