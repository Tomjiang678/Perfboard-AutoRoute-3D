# Device Library

器件库和多单元器件映射数据。

需要覆盖：

- 基础无源器件
- LED, diode, transistor
- DIP/SIP/TO-92 packages
- comparator, op-amp, timer, logic IC
- headers and connectors

器件库记录具体型号的电气和封装知识，不直接记录真实 3D 外观。例如 `LM393` 记录为双比较器、DIP-8、引脚功能映射；渲染时交给 DIP-8 参数化模型生成器。
