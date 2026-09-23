# Beady 图纸算法审计与参考

## 优化前 pipeline

1. 浏览器/小程序先以目标网格的 4 倍分辨率高质量缩放。
2. `sampler` 对每格覆盖区域在线性 RGB 中求面积均值；高局部亮度跨度时只施加克制的细节偏置。
3. `quantizer` 构建 5-bit RGB 直方图，以 Lab 距离做确定性远点播种，再执行加权 Lab K-means。`colorLimit` 在此阶段生效。
4. `colorMatcher` 用 CIEDE2000 将聚类中心映射到 MARD 221，再让每个格子独立匹配该 MARD 子集。
5. `fragmentOptimizer` 只处理“非边缘且上下左右完全同色”的近似孤点。

断层的主要来源是第 4 步的独立硬分类：聚类与匹配没有空间坐标，相邻格子在两个近似候选色之间接近决策边界时会各自跳色。旧的碎色步骤覆盖范围很窄，也没有跨格边缘图可用于判断哪些边界可合并。

## 本项目的独立实现

- `edgeDetector` 同时使用格内亮度跨度与相邻格 CIEDE2000 差异，建立局部对比度和四邻域连接权重。
- `spatialRefiner` 使用有界 ICM 思路：数据项保持对原图颜色的忠实，邻域项只在平坦/缓变区域鼓励一致；高对比位置提高数据项权重。候选标签仅来自已经选出的 MARD 子集，因此不会突破颜色上限。
- `regionCleaner` 用 BFS 检测连通块，但绝不按面积直接删除。只有原图局部对比低、边界支持充分、两种 MARD 色接近且替换后的原图色差增量很小，才合并小区域。
- 最多 4 次空间迭代并支持提前收敛；不使用任何 dithering。

## 公开项目参考与许可证

- [Pindou Studio](https://github.com/Aswellle/Pindou-Studio) — MIT。参考其 Lab/K-means++、edge-aware sampling 与 ICM 空间一致性的 pipeline 思路。
- [Zippland / perler-beads](https://github.com/Zippland/perler-beads) — AGPL-3.0。仅参考 README 所述的主导色、BFS 连通区域与相似色区域合并思想；未复制其代码，以避免许可证传播要求影响本项目。
- [Fusible Beads Studio](https://github.com/yourlin/Fusible-Beads-Studio) — MIT。参考其 CIELAB/CIEDE2000 色板匹配职责划分；其可选 Floyd–Steinberg 与 Beady 的实体拼制目标不符，未采用。

本轮所有新增算法均针对 Beady 当前数据结构独立编写，没有复制上述项目的实现代码。

## v3 核心替换：MARD-constrained clean pipeline

上一版仍存在杂色的根因不只是空间连续性：

1. 旧采样器先求区域均值，再混入一个极端明暗像素。黑嘴与白毛交界处会因此生成原图不存在的中间灰；当候选中性色不足时，这些中间灰又可能被映射成灰紫等偏色。
2. 旧量化先在自由 Lab 空间聚类，再把中心映射到 MARD。多个中心可能坍缩到同一色号，或让候选子集缺少合适的黑白灰。
3. 每格只能在这个间接得到的子集中选色；当中性色缺席时，CIEDE2000 最近项也可能是带紫、蓝或绿偏色的低明度色号。
4. 后处理只能改变已经选入的色号，无法纠正候选色卡本身的系统性偏色。

v3 完整替换为：

- 每格在 Lab 中做局部双模态分析，选择实际存在的主导模式；黑色笔画覆盖达到可靠比例时选择暗模式，不再人为混合两种颜色。
- 直接在 MARD 221 上执行加权 medoid/farthest-demand 选色，取消“自由聚类中心 → MARD”这一层间接映射。
- 距离以 CIEDE2000 为基础，并对低饱和、极亮、极暗输入增加 chroma 偏离惩罚，防止黑白灰错误落入彩色珠。
- 标签优化只在已选 MARD 子集内工作；基于原图局部对比决定邻域一致性强度。
- 小区域清理比较替换前后对原图的感知误差。黑嘴替换成白色会产生很大误差，因此即使面积小也会保留；白毛中的紫色近似伪影则会被拒绝或合并。

新增参考：

- [Pindo](https://github.com/LunarXuan/Pindo) — GPL-3.0，只研究其浏览器本地 scaling/matching/cleanup 分层和多品牌实体色卡架构，未复制代码。
- [real-jiakai/perler-studio](https://github.com/real-jiakai/perler-studio) — 参考其 sRGB→Lab、CIEDE2000 与实体色卡直接匹配的职责划分；仓库页未明确显示可复用许可证，因此仅采用通用算法思想。

上一版生成器和采样器分别保存在 `spatialV2PatternGenerator.js` 与 `legacySampler.js`，用于固定 benchmark 的 OLD / NEW 对比。
