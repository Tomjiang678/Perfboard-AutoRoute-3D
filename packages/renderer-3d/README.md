# 3D Renderer

Three.js 渲染复用层。

职责：

- board mesh
- parametric components
- routes and jumpers
- transparent and exploded inspection modes
- picking and highlighting contracts

模型策略：

- 不维护每个具体型号的真实模型。
- 维护封装/器件大类参数化生成器。
- 典型生成器包括 resistor, capacitor, inductor, diode, led, to92, dip, header, terminal, switch。
- 引脚坐标必须由封装参数确定，并与洞洞板格点一致。
