# Tools

`import-kicad-symbols.mjs` 是 **KiCad** 引脚模型库的唯一生成入口：从 KiCad 符号库读取物理脚号，重新生成 `apps/web/src/features/import/pinLibraryGenerated.json`。KiCad 网表的引脚名富化、电源脚识别只读这一个文件。

## Multisim 内置型号库

`apps/web/src/features/import/pinLibraryOverrides.json` 现在是 **Multisim 内置型号库**，由 `apps/web/src/features/import/multisim/builtinPinModels.ts` 只读加载：value 正则 → 逻辑脚/单元/电源脚映射。之前支持过的型号（TL06x、LM358、LM324、LM393、NE555、74xx、LM317、IRF540、2N3904/3906、OP07、七段/字母数码管等）都从这里自动解析，不再要求用户手填。

- 用户自己保存的 profile 同名时优先于内置型号；
- 没有匹配到内置型号的器件才进入 `Multisim parts` 工作台；
- 不要为了给单个工程“打补丁”而改这个文件，工程内的用户配置才是覆盖手段；
- 如果确实要扩充内置型号，改完后必须跑 `tests/builtinProfiles.test.ts` 与 `npm run build`，并在发布说明里注明。

## 用户引脚配置回流

用户在映射工作台补录的型号配置会匿名回流到 `deploy/pin-profile-server.mjs`，再由 `merge-pin-profiles.mjs` 合并：

```bash
node tools/merge-pin-profiles.mjs --in submissions/ --report pin-profile-report.md
```

- 相同内容只累加确认次数；同一型号映射不一致会写进报告，不会自动合并；
- 默认 ≥2 份独立提交才写入 `apps/web/src/features/import/multisim/multisimProfiles.json`（随包发布的内置库）；
- `--min-confirmations 1` 用于人工确认过的单个提交。

## 存档工具

以下脚本是 Multisim 时代的遗留，会写入上面那个内置型号库。**不再参与常规流程**，只用于维护/考古：

- `add-pin-model.mjs`：根据 Multisim 交叉报告、全脚接地网表和 `%p/%t` 模型生成型号映射。
- `add-kicad-override.mjs`：用 KiCad 符号库的物理脚号辅助生成 override。
- `add-import-json.mjs`：直接追加 JSON 到引脚库或行为规则库。
