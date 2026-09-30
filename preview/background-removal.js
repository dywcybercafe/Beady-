(function exposeBackgroundRemovalClient(global) {
  const MODEL_NAME = 'u2netp'
  const SCRIPT_URL = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL('./background-removal.js', document.baseURI).href
  const ASSET_BASE_URL = new URL('./', SCRIPT_URL)
  const MODEL_URL = new URL('models/u2netp.onnx', ASSET_BASE_URL).href
  const WASM_MODULE_URL = new URL('vendor/onnxruntime/ort-wasm-simd-threaded.mjs', ASSET_BASE_URL).href
  const WASM_BINARY_URL = new URL('vendor/onnxruntime/ort-wasm-simd-threaded.wasm', ASSET_BASE_URL).href
  const ALPHA_THRESHOLD = 8
  const CROP_PADDING = 2

  let sessionPromise = null
  let runtimePromise = null
  let runtimeDiagnostics = null

  function configureRuntime() {
    const ort = global.ort
    const rembg = global.RembgWeb
    if (!ort || !rembg) throw new Error('本地抠图组件加载失败，请刷新页面后重试')

    // Bind exact same-origin files instead of letting ORT infer paths. This is
    // safe under localhost and a GitHub Pages repository sub-path alike.
    ort.env.wasm.wasmPaths = {
      mjs: WASM_MODULE_URL,
      wasm: WASM_BINARY_URL
    }
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    ort.env.wasm.simd = true
    ort.env.wasm.initTimeout = 120000
    rembg.rembgConfig.enableGeneralLogging(false)
    rembg.rembgConfig.enablePerformanceLogging(false)
    rembg.rembgConfig.setCustomModelPath(MODEL_NAME, MODEL_URL)
    return { ort, rembg }
  }

  async function inspectAsset(url, expectedType) {
    const diagnostic = { url, status: 0, contentType: '', ok: false }
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-cache', credentials: 'same-origin' })
      diagnostic.status = response.status
      diagnostic.contentType = response.headers.get('content-type') || ''
      diagnostic.ok = response.ok
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (expectedType && !diagnostic.contentType.toLowerCase().includes(expectedType)) {
        throw new Error(`Content-Type ${diagnostic.contentType || '缺失'}，期望 ${expectedType}`)
      }
      return diagnostic
    } catch (error) {
      diagnostic.error = error && error.message ? error.message : String(error)
      const failure = new Error(
        `WASM 静态资源加载失败\nURL: ${url}\nHTTP: ${diagnostic.status || '无响应'}\n` +
        `Content-Type: ${diagnostic.contentType || '未知'}\n原因: ${diagnostic.error}`
      )
      failure.diagnostics = diagnostic
      throw failure
    }
  }

  function ensureRuntimeReady() {
    if (runtimePromise) return runtimePromise
    runtimePromise = Promise.resolve().then(async () => {
      configureRuntime()
      const results = await Promise.all([
        inspectAsset(WASM_MODULE_URL, 'javascript'),
        inspectAsset(WASM_BINARY_URL, 'application/wasm')
      ])
      runtimeDiagnostics = {
        pageUrl: location.href,
        secureContext: global.isSecureContext,
        assets: results
      }
      console.info('[Beady WASM] runtime assets ready', runtimeDiagnostics)
      return global.RembgWeb
    }).catch(error => {
      runtimePromise = null
      console.error('[Beady WASM] runtime initialization failed', error.diagnostics || {
        pageUrl: location.href,
        moduleUrl: WASM_MODULE_URL,
        wasmUrl: WASM_BINARY_URL,
        reason: error.message
      })
      throw error
    })
    return runtimePromise
  }

  function requireRuntime() {
    return configureRuntime().rembg
  }

  function getSession() {
    if (sessionPromise) return sessionPromise
    sessionPromise = ensureRuntimeReady().then(rembg => {
      return rembg.newSession(MODEL_NAME, undefined, {
        executionProviders: ['wasm'],
        preferWebNN: false,
        preferWebGPU: false,
        simd: true,
        proxy: false,
        numThreads: 1,
        bypassSessionCache: false,
        bypassModelCache: false
      })
    }).catch(error => {
      sessionPromise = null
      const details = runtimeDiagnostics && runtimeDiagnostics.assets
        ? runtimeDiagnostics.assets.map(asset => `${asset.url} -> HTTP ${asset.status}, ${asset.contentType || 'unknown MIME'}`).join('\n')
        : `WASM: ${WASM_BINARY_URL}`
      const wrapped = new Error(`${error.message}\n${details}`)
      wrapped.cause = error
      throw wrapped
    })
    return sessionPromise
  }

  async function removeBackground(file, options = {}) {
    if (!(file instanceof Blob)) throw new Error('请选择有效的图片')
    const rembg = requireRuntime()
    const report = typeof options.onProgress === 'function' ? options.onProgress : () => {}

    report({ phase: 'prepare', progress: 3, message: '正在准备图片…' })
    const prepared = await trimBlackLetterbox(file)
    report({ phase: 'model', progress: 8, message: '正在加载本地 u2netp 模型…' })
    const session = await getSession()

    const transparentBlob = await rembg.remove(prepared, {
      session,
      postProcessMask: true,
      onProgress(info) {
        const raw = Number.isFinite(info && info.progress) ? info.progress : 0
        const normalized = raw <= 1 ? raw * 100 : raw
        report({
          phase: 'inference',
          progress: Math.max(10, Math.min(92, 10 + normalized * .82)),
          message: '正在本机识别并去除背景…'
        })
      }
    })

    report({ phase: 'crop', progress: 94, message: '正在自动裁除透明区域…' })
    const cropped = await cropTransparentBounds(transparentBlob)
    report({ phase: 'done', progress: 100, message: '抠图完成' })

    return {
      dataUrl: await blobToDataUrl(cropped.blob),
      width: cropped.width,
      height: cropped.height,
      name: (file.name || '拼豆作品').replace(/\.[^.]+$/, ''),
      model: MODEL_NAME,
      processing: 'browser-wasm'
    }
  }

  async function cropTransparentBounds(blob) {
    const source = await decodeImage(blob)
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(source.image, 0, 0)
    source.close()

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) throw new Error('未识别到可保留的主体')
    minX = Math.max(0, minX - CROP_PADDING)
    minY = Math.max(0, minY - CROP_PADDING)
    maxX = Math.min(canvas.width - 1, maxX + CROP_PADDING)
    maxY = Math.min(canvas.height - 1, maxY + CROP_PADDING)
    const width = maxX - minX + 1
    const height = maxY - minY + 1

    const output = document.createElement('canvas')
    output.width = width
    output.height = height
    output.getContext('2d').drawImage(canvas, minX, minY, width, height, 0, 0, width, height)
    return { blob: await canvasToBlob(output), width, height }
  }

  async function trimBlackLetterbox(file) {
    const source = await decodeImage(file)
    const sampleHeight = Math.min(512, source.height)
    const sampleWidth = Math.max(24, Math.round(source.width * sampleHeight / source.height))
    const sample = document.createElement('canvas')
    sample.width = sampleWidth
    sample.height = sampleHeight
    const context = sample.getContext('2d', { willReadFrequently: true })
    context.drawImage(source.image, 0, 0, sampleWidth, sampleHeight)
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data
    const activeRows = []
    for (let y = 0; y < sampleHeight; y += 1) {
      let luminance = 0
      for (let x = 0; x < sampleWidth; x += 1) {
        const index = (y * sampleWidth + x) * 4
        luminance += pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722
      }
      activeRows.push(luminance / sampleWidth > 22)
    }

    const first = activeRows.indexOf(true)
    const last = activeRows.lastIndexOf(true)
    const topBar = first / sampleHeight
    const bottomBar = (sampleHeight - last - 1) / sampleHeight
    const contentRatio = (last - first + 1) / sampleHeight
    const hasScreenshotBars = first >= 0 && topBar > .08 && bottomBar > .08 && contentRatio > .2
    if (!hasScreenshotBars) {
      source.close()
      return file
    }

    const scaleY = source.height / sampleHeight
    const sourceY = Math.max(0, Math.floor((first - 1) * scaleY))
    const sourceBottom = Math.min(source.height, Math.ceil((last + 2) * scaleY))
    const height = sourceBottom - sourceY
    const output = document.createElement('canvas')
    output.width = source.width
    output.height = height
    output.getContext('2d').drawImage(source.image, 0, sourceY, source.width, height, 0, 0, source.width, height)
    source.close()
    return await canvasToBlob(output)
  }

  async function decodeImage(blob) {
    if ('createImageBitmap' in global) {
      const bitmap = await createImageBitmap(blob)
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close && bitmap.close() }
    }
    return new Promise((resolve, reject) => {
      const image = new Image()
      const url = URL.createObjectURL(blob)
      image.onload = () => resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url)
      })
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')) }
      image.src = url
    })
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成透明 PNG')), 'image/png')
    })
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('无法读取透明 PNG'))
      reader.readAsDataURL(blob)
    })
  }

  global.BeadyBackgroundRemoval = {
    removeBackground,
    preload: getSession,
    modelName: MODEL_NAME,
    getRuntimeDiagnostics: () => runtimeDiagnostics || {
      pageUrl: location.href,
      moduleUrl: WASM_MODULE_URL,
      wasmUrl: WASM_BINARY_URL
    }
  }
})(window)
