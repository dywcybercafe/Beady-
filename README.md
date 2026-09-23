# 豆绘微信小程序

一个将图片转换为结构化拼豆图纸的微信小程序。当前核心算法使用双模态区域采样、直接受 MARD 221 约束的色卡量化、中性色保护、边缘感知标签优化和保守杂色清理，并输出二维格子数据与颜色统计。

“仅保留主体”目前保留了处理接口和生成元数据，但仍按完整图片生成；尚未接入自动抠图。

## 本地预览

1. 安装并打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本仓库根目录。
4. AppID 可使用测试号，或将 `project.config.json` 中的 `appid` 替换为自己的小程序 AppID。
5. 导入后点击“编译”即可预览首页。

## 浏览器快速预览

首次使用毛毡板的 BiRefNet General Lite 自动抠图时，在项目根目录安装本地 Python 依赖：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-rembg.txt
```

启动同时提供静态页面和抠图 API 的同源服务（前后端只需这一个命令）：

```bash
./start-preview.command
```

默认打开 `http://localhost:4174/preview/`。可在命令后传入其他端口，例如 `./start-preview.command 4180`。不要使用 `file://` 或普通静态服务器测试自动抠图，因为它们不提供 `/api/remove-background`。首次抠图会加载约 224 MB 的 `birefnet-general-lite` ONNX 模型，之后均在本机离线推理。

固定猫咪样本的 OLD / NEW 对比页面位于 `http://localhost:4174/benchmark/`。重新生成 benchmark 需要 Node.js 与 `sharp`：

```bash
node scripts/generate_cat_benchmark.js
```

## 目录结构

```text
components/
  upload-card/           图片上传与预览
  size-selector/         预设、自定义尺寸与比例锁定
  background-selector/   背景处理方式
  color-limit-selector/  颜色数量上限
  bottom-nav/            固定底部导航
pages/
  home/                  首页状态编排与生成入口
  result/                图纸画布、缩放、拖动和颜色高亮
services/image/
  sampler.js             双模态区域采样（避免边缘混出不存在的颜色）
  legacySampler.js       A/B 测试用旧采样器
  quantizer.js           有限候选色提取
  colorMatcher.js        CIEDE2000 色卡匹配
  paletteQuantizer.js    直接受 MARD 约束的量化与中性色保护
  labelOptimizer.js      新版边缘感知标签优化
  artifactCleaner.js     基于原图拟合度的保守杂色清理
  edgeDetector.js        原图边缘与局部对比分析
  spatialRefiner.js      边缘感知 ICM 空间一致性优化
  regionCleaner.js       保守的相似小区域清理
  legacyPatternGenerator.js  A/B 测试用旧算法
  spatialV2PatternGenerator.js  上一版完整算法基线
  patternGenerator.js    图纸数据编排
benchmark/                固定猫咪样本与可视化 A/B 页面
docs/algorithm-references.md  算法审计、参考来源及许可证说明
data/
  mard221.js             MARD 221 色卡与 Lab 值
```
