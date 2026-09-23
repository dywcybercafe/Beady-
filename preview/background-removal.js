(function exposeBackgroundRemovalClient(global) {
  async function removeBackground(file) {
    const response = await fetch('/api/remove-background', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: file
    })

    if (!response.ok) {
      let message = 'BiRefNet 抠图服务暂时不可用'
      try { message = (await response.json()).error || message } catch (error) { /* non-JSON error */ }
      throw new Error(message)
    }

    const blob = await response.blob()
    const dimensions = await readDimensions(blob)
    return {
      dataUrl: await blobToDataUrl(blob),
      width: dimensions.width,
      height: dimensions.height,
      name: file.name.replace(/\.[^.]+$/, ''),
      model: response.headers.get('X-Background-Model') || 'birefnet-general-lite'
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('无法读取透明 PNG'))
      reader.readAsDataURL(blob)
    })
  }

  function readDimensions(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      const url = URL.createObjectURL(blob)
      image.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('抠图服务返回了无效图片'))
      }
      image.src = url
    })
  }

  global.BeadyBackgroundRemoval = { removeBackground }
})(window)
