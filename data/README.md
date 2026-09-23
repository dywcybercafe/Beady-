# MARD 221 色卡数据

本目录的 MARD 221 数据来自 HansBug 的 `pindou-color-data` 仓库中
`mard-221-alfonse-doudou` 数据集：

- 来源：https://github.com/HansBug/pindou-color-data/tree/main/mard-221-alfonse-doudou
- 上游说明：MARD 221 色（Alfonse + 豆豆工坊核对版）
- 数据许可证：MIT
- 上游版权：Copyright (c) 2026 HansBug

许可证全文保存在 `licenses/pindou-color-data-MIT.txt`。

`mard221.source.json` 是保留来源字段的上游数据快照；`mard221.js` 由
`scripts/build_mard_palette.js` 生成，并在构建时为每个 RGB 色值计算 CIELAB。
屏幕 RGB/HEX 仅用于图纸匹配和预览，不代表不同批次实体拼豆在所有光照下的绝对颜色。
