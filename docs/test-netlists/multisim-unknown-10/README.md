# Multisim 未知型号测试集（10 组）

每组一个目录，包含一对文件：

- `netlist.txt`：模拟 Multisim `Simulate → Reports → Netlist Report`；
- `crossref.txt`：模拟 `Cross Reference Report`。

导入时把同一目录下的两份文件一起拖进去。每组都至少有两个内置库不认识的型号，同时混入一个已知型号，用来验证“已知自动解析、未知留在工作台”。

## 分组

| 组 | 电路 | 已知型号 | 未知型号 | 预期待补 |
|---|---|---|---|---:|
| 01 | ESP32 + BME280 + 555 | NE555 | ESP32-WROOM-32、BME280 | 2 |
| 02 | OLED + I²C 多路复用 + 稳压 | LM317 | SSD1306、TCA9548A、ESP32-WROOM-32 | 3 |
| 03 | IO 扩展 + 达林顿阵列 | 2N3904 | MCP23017、ULN2003A | 2 |
| 04 | 电流检测 + RTC + 运放 | OP07 | ACS712、DS3231、ESP32-WROOM-32 | 3 |
| 05 | LED 驱动 + TFT + 555 | NE555 | MAX7219、ST7735 | 2 |
| 06 | AC-DC + LDO + 317 | LM317 | HLK-PM01、AMS1117-3.3 | 2 |
| 07 | SPI Flash + USB 串口 + 555 | NE555 | W25Q64、CH340C | 2 |
| 08 | 六轴 + 气压 + 三极管 | 2N3904 | MPU6050、BMP180 | 2 |
| 09 | TFT + 触摸 + 译码器 | 74LS138 | ST7735、XPT2046 | 2 |
| 10 | PWM + 电机驱动 + 运放 | OP07 | PCA9685、TB6612FNG | 2 |

## 实测

每组都能被解析为独立的一对报告，`warnings = 0`，且待补型号数量与上表一致。部分 DIP/SOIC/TSSOP 封装会自动预填脚数：

- `MCP23017` 28、`TCA9548A` 24、`ACS712` 8、`DS3231` 16、`MAX7219` 24、`ULN2003A` 16、`W25Q64` 8、`CH340C` 16、`XPT2046` 16、`PCA9685` 28、`TB6612FNG` 24、`AMS1117-3.3` 4；
- 模块类（ESP32、BME280、SSD1306、ST7735、HLK-PM01、MPU6050、BMP180）没有可推断的脚数，需要手填。

已知型号（NE555、LM317、2N3904、OP07、74LS138）应当直接解析，不出现在 `Multisim parts` 里。
