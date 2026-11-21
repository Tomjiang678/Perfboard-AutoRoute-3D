# Multisim 非 IC 未知器件测试（单组）

一组网表 + 交叉引用，覆盖各种**非 IC / 分立器件**，其中绝大多数不在内置型号库里：

- `netlist.txt`
- `crossref.txt`

一起导入即可。

## 元件清单

| 位号 | 型号 | 类型 | 封装 | 逻辑脚 |
|---|---|---|---|---|
| Q1 | 2N2222A | NPN | TO-92 | E、B、C |
| Q2 | BC557 | PNP | TO-92 | E、B、C |
| Q3 | TIP120 | NPN 达林顿 | TO-220 | B、C、E |
| Q4 | 2N7000 | N 沟道 MOSFET | TO-92 | G、D、S |
| Q5 | BS250 | P 沟道 MOSFET | TO-92 | G、D、S |
| Q6 | 2N5457 | N 沟道 JFET | TO-92 | G、D、S |
| Q7 | MPSA42 | 高压 NPN | TO-92 | E、B、C |
| Q8 | BT136 | 双向可控硅 | TO-220 | A1、A2、G |
| Q9 | 2N5060 | 单向可控硅 | TO-92 | A、K、G |
| U1 | TL431 | 可调基准 | TO-92 | REF、A、K |
| D1 | 1N4007 | 整流二极管 | DO-41 | A、K |
| D2 | 1N4733A | 稳压二极管 | DO-41 | A、K |
| K1 | G5V-1 | 继电器 | G5V-1 | COIL+、COIL-、COM、NO、NC |
| OK1 | PC817 | 光耦 | DIP-4 | A、K、C、E |
| BR1 | KBPC3510 | 整流桥 | KBPC | AC1、AC2、+、- |
| T1 | 230V_12V | 变压器 | TRANSFORMER | P1、P2、S1、S2 |
| Y1 | 16MHz | 晶振 | HC-49 | X1、X2 |
| C1 / C2 | 22pF | 电容 | C_DISC | 1、2 |
| RV1 | 10K | 电位器 | POT | A、W、B |
| SW1 | SW_PUSH | 按键 | SW | A、B |
| LS1 | 8OHM | 扬声器 | SPEAKER | +、- |
| M1 | MOTOR_DC | 直流电机 | MOTOR | +、- |

## 电路

- Q1 驱动 K1 线圈，D1 做续流；
- Q2 作为高侧开关，驱动 Q3（电机 M1）、Q4（光耦 OK1）、Q7（高压负载）；
- OK1 的输出与 TL431 阴极共同控制 Q5，Q5/Q6 驱动 LS1；
- Q7 输出给 BR1，T1 次级接 BR1 交流输入；
- Q8 双向可控硅、Q9 单向可控硅组成交流触发；
- Y1 与 C1/C2 组成晶振负载；
- RV1 提供 REF，SW1 提供 CTRL。

## 预期结果

- 元件 23 个、网络 18 个、节点 65 个、`warnings = 0`；
- 21 个型号进入 `Multisim parts`；
- C1、C2 是普通 2 脚电容，会自动解析，不进入待补；
- 有封装提示的会自动预填：三极管/TO-92 3 脚、TO-220 3 脚、二极管 DO-41 2 脚、PC817 4 脚、晶振 2 脚；
- 继电器 G5V-1、整流桥 KBPC、变压器、电位器、按键、扬声器、电机没有可推断脚数，需要手填。
