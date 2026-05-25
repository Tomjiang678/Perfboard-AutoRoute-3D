# Multisim 报告导出实例分析

分析时间：2026-05-22

目录：`multisim报告导出实例`

## 文件清单

- `try1-网表.txt`
- `try1-真实元器件.txt`
- `try1-虚拟元器件.txt`
- `try1-交叉引用报告.txt`
- `try1-多余门电路.txt`

当前导出的中文标题和表头以 `_ucXXXX` 形式出现，但主体数据是可读的。导入器可以先忽略标题行和分隔线，按表格正文解析。

## 有用程度排序

### 1. `try1-网表.txt`

最关键。

用途：

- 解析网络名。
- 解析每个网络连接到哪些元件引脚。
- 生成 `nets` 和 `logicalSymbols` 的基础数据。

示例内容：

```text
1   try1   R3    1
1   try1   U1A   1OUT
1   try1   R1    2
2   try1   U1A   1IN+
2   try1   R2    2
```

可得到：

```text
net 1: R3.1, U1A.1OUT, R1.2
net 2: U1A.1IN+, R2.2
```

注意：

- 网表里运放以 `U1A`、`U2A`、`U3A` 这样的逻辑单元出现。
- 电源网络如 `VCC`、`VDD`、`VDC5` 也在其中。
- 网表不能单独决定真实封装和型号，需要与交叉引用/真实元器件报告合并。

### 2. `try1-交叉引用报告.txt`

非常有用，建议作为元件清单主来源。

用途：

- 一行一个 RefDes。
- 同时包含元件值/型号、类别、封装、所属设计。
- 比 BOM 汇总表更适合做导入器，因为不用拆 `U1, U2, U3` 这种合并字段。

示例内容：

```text
U1   TL062IP   OPAMP      PDIP-P-8   try1
R4   1kOhm     RESISTOR   -          try1
Q1   2N1711    BJT_NPN    TO-39      try1
D3   1N4149    DIODE      DO-35      try1
```

可得到：

```text
component U1:
  value/model: TL062IP
  category: OPAMP
  package: PDIP-P-8
```

这是后续 `Part Resolver` 最需要的数据。

### 3. `try1-真实元器件.txt`

有用，但更像汇总 BOM。

用途：

- 获取真实器件型号。
- 获取数量。
- 获取多个 RefDes 合并清单。
- 获取制造商信息。

示例内容：

```text
3   OPAMP, TL062IP   U1, U2, U3   IPC-2221A/2222\PDIP-P-8   Texas Instruments
1   BJT_NPN, 2N1711  Q1           Generic\TO-39
2   DIODE, 1N4149    D2, D3       National Semiconductor\DO-35
```

注意：

- `U1, U2, U3` 在一行里，需要拆分。
- 对器件采购和器件库匹配有帮助。
- 对逐个 RefDes 建模不如交叉引用报告直接。

### 4. `try1-虚拟元器件.txt`

有用，尤其对电阻、电容、电源符号。

用途：

- 获取 Multisim 中被视为虚拟元器件的项目。
- 包含电阻、电容、电源、地等。
- 对洞洞板布线来说，电阻电容仍然是实际需要放置的元件，所以不能忽略。

示例内容：

```text
5   RESISTOR, 1kOhm        R1, R2, R3, R4, R5
1   RESISTOR, 100kOhm      R6
1   CAP_ELECTROLIT, 100uF  C1
1   CAPACITOR, 100pF       C2
1   POWER_SOURCES, VCC     VCC
```

注意：

- 电源、地符号不是实际元器件，不应生成普通 3D 器件。
- 电阻、电容虽然在虚拟元器件报告里，但对洞洞板项目是实际器件，需要进入 `physicalParts`。
- 虚拟元器件缺少封装时，需要根据类别和用户选型补默认封装，例如轴向电阻、径向电解电容等。

### 5. `try1-多余门电路.txt`

有用，但不是主输入。

用途：

- 识别多单元器件里的未使用单元。
- 对运放、比较器、逻辑门尤其有价值。

示例内容：

```text
U1   TL062IP   B
U2   TL062IP   B
U3   TL062IP   B
```

含义：

- U1/U2/U3 是 TL062IP。
- B 单元未使用。

后续用途：

- 在器件映射中标记 unused unit。
- 后期可以提示未使用运放/比较器输入端需要固定到安全电平。

## 推荐导入策略

第一阶段应支持导入以下组合：

```text
网表报告 + 交叉引用报告
```

这是最直接、最稳定的组合。

第二阶段补充：

```text
真实元器件报告 + 虚拟元器件报告 + 多余门电路报告
```

用于增强器件库匹配、采购信息、默认封装推断和未使用单元检查。

## 建议导入器

新增 Multisim 报告导入器：

```text
MultisimNetReportImporter
MultisimCrossReferenceImporter
MultisimRealBomImporter
MultisimVirtualBomImporter
MultisimUnusedGateImporter
```

也可以先做一个聚合导入器：

```text
MultisimReportBundleImporter
```

它接收多个 `.txt` 文件，根据文件内容自动识别类型，然后合并为 Circuit IR。

## 对 Circuit IR 的影响

建议解析后形成：

```text
components:
  U1, U2, U3, R1...R7, C1, C2, D2, D3, Q1

logicalSymbols:
  U1A, U2A, U3A

nets:
  0, 1, 2, ..., VCC, VDD, VDC5, VEE

physicalParts:
  U1: TL062IP, PDIP-P-8
  U2: TL062IP, PDIP-P-8
  U3: TL062IP, PDIP-P-8
  R1-R7: resistor, package pending/default
  C1-C2: capacitor, package pending/default
  D2-D3: diode, DO-35
  Q1: 2N1711, TO-39

unusedUnits:
  U1.B, U2.B, U3.B
```

## 结论

这批导出报告很有用，不需要直接解析 `.ms14` 也能拿到一期导入所需的大部分信息。

最小可用输入应定为：

```text
try1-网表.txt + try1-交叉引用报告.txt
```

增强输入为：

```text
try1-真实元器件.txt
try1-虚拟元器件.txt
try1-多余门电路.txt
```

