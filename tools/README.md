# Tools

`add-pin-model.mjs` 用来把 Multisim 器件加入项目引脚库：输入器件型号或编号，它会从 `docs` 查交叉表和全脚接地网表，再用网表脚名校验 `%p/%t` 模型并更新 `apps/web/src/features/import/pinLibraryData.json`。
运行方式：在项目根目录执行 `node tools/add-pin-model.mjs` 交互输入，或执行 `node tools/add-pin-model.mjs --device LM358AD --model "x%p_a %t1IN+ %t1IN- %tVS+ %tVS- %t1OUT %m"`；多行模型在 Windows 上建议先复制整段，然后交互输入 `:clip` 或命令行使用 `--model-clipboard`。
使用前请把该器件所有脚都接地并导出网表到 `docs`；74 系列模型如果隐藏了电源脚，工具会按封装自动补 `GND=pinCount/2` 和 `VCC=pinCount` 并给其它 `%t` 脚跳过这些物理脚。
如果网表不完整、脚名对不上、或 `%t` 加隐藏电源后的脚数和封装脚数不一致，工具会停止且不会写入不确定映射。
