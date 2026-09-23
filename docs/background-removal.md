# 毛毡板自动抠图

## 方案

毛毡板使用本地 Python 服务运行 `rembg 2.0.59` 与 `birefnet-general-lite`。前端不执行主体识别，仅将用户选择的图片发送到同源接口 `/api/remove-background`，并接收透明 PNG。

选择服务端方案的原因：

- BiRefNet General Lite ONNX 权重约 224 MB，不适合在移动浏览器中下载和运行。
- 当前项目是无构建步骤的静态 HTML/CSS/JS，同源 Python 服务可以同时提供预览页和 API，不需要 CORS 或浏览器模型运行时。
- `birefnet-general-lite` 是通用前景分割模型，不是人像专用模型。

## 处理流程

1. 前端以原始图片二进制请求调用同源 API。
2. Python 服务复用一个常驻 `birefnet-general-lite` ONNX session。
3. `rembg` 使用 BiRefNet 输出软 alpha mask，本项目不使用 alpha matting、颜色阈值或矩形代替分割。
4. 根据模型 alpha 的非空范围裁掉透明空白，裁切不修改 alpha 边缘。
5. 返回 RGBA PNG，由毛毡板作为独立对象添加。

## 主要文件

- `services/background_removal_service.py`：模型 session、推理和 alpha 裁边。
- `scripts/serve_preview.py`：静态预览与同源抠图 API。
- `preview/background-removal.js`：前端 API client，不包含分割算法。
- `scripts/benchmark_background_removal.py`：可复现的 benchmark 命令和 alpha 统计。

## 上游

- rembg: <https://github.com/open-mit/rembg>
- BiRefNet: <https://github.com/ZhengPeng7/BiRefNet>
