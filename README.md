# 豆绘微信小程序

一个将图片转换为结构化拼豆图纸的微信小程序。当前核心算法使用双模态区域采样、直接受 MARD 221 约束的色卡量化、中性色保护、边缘感知标签优化和保守杂色清理，并输出二维格子数据与颜色统计。

毛毡板的“添加拼豆”使用 u2netp + ONNX Runtime Web 在浏览器内本地抠图。用户图片不会上传服务器，处理后会自动裁除外围透明区域并加入毛毡板。

## 本地预览

1. 安装并打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本仓库根目录。
4. AppID 可使用测试号，或将 `project.config.json` 中的 `appid` 替换为自己的小程序 AppID。
5. 导入后点击“编译”即可预览首页。

## 浏览器快速预览

启动纯静态本地预览：

```bash
./start-preview.command
```

默认打开 `http://localhost:4174/preview/`。可在命令后传入其他端口，例如 `./start-preview.command 4180`。抠图不需要 Python 依赖或 API；首次使用时会从当前站点加载约 4.4 MB 的 u2netp 模型，后续处理复用同一个浏览器会话。

## GitHub Pages

仓库根目录是可直接发布的静态站点。在 GitHub 仓库的 **Settings → Pages** 中选择 **Deploy from a branch**，并将发布目录设为主分支的 `/ (root)`。访问 Pages 根地址会自动进入 Beady 浏览器版。所有 u2netp、WASM 和运行库文件均与页面同源加载。

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
preview/
  background-removal.js  浏览器本地 u2netp 抠图、透明边界裁剪
  models/u2netp.onnx     轻量抠图模型
  vendor/                ONNX Runtime Web、rembg-web 与许可证
benchmark/                固定猫咪样本与可视化 A/B 页面
docs/algorithm-references.md  算法审计、参考来源及许可证说明
data/
  mard221.js             MARD 221 色卡与 Lab 值
```

## 浏览器抠图依赖

- `@bunnio/rembg-web`：MIT，<https://github.com/bunn-io/rembg-web>
- `onnxruntime-web`：MIT，<https://github.com/microsoft/onnxruntime>
- `u2netp` / U-2-Net：Apache-2.0，<https://github.com/xuebinqin/U-2-Net>

许可证副本位于 `preview/vendor/licenses/`。
