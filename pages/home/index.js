const MARD221 = require('../../data/mard221')
const Sampler = require('../../services/image/sampler')
const PatternGenerator = require('../../services/image/patternGenerator')

Page({
  data: {
    imagePath: '',
    imageWidth: 1,
    imageHeight: 1,
    imageRatio: 1,
    sizeMode: 'preset',
    selectedPreset: '78x78',
    customWidth: 113,
    customHeight: 78,
    lockRatio: true,
    backgroundMode: 'keep',
    colorMode: 'preset',
    colorLimit: 24,
    customColorLimit: 24,
    currentNav: 'create',
    isGenerating: false
  },

  onImageChange(event) {
    const { path, width, height } = event.detail
    const imageRatio = width > 0 && height > 0 ? width / height : 1
    const next = { imagePath: path, imageWidth: width, imageHeight: height, imageRatio }

    if (this.data.sizeMode === 'custom' && this.data.lockRatio) {
      next.customHeight = Math.max(1, Math.round(this.data.customWidth / imageRatio))
    }

    this.setData(next)
  },

  onImageRemove() {
    this.setData({ imagePath: '', imageWidth: 1, imageHeight: 1, imageRatio: 1 })
  },

  onPresetChange(event) {
    this.setData({ sizeMode: 'preset', selectedPreset: event.detail.value })
  },

  onSizeModeChange() {
    this.setData({ sizeMode: 'custom' })
  },

  onCustomSizeChange(event) {
    this.setData({
      customWidth: event.detail.width,
      customHeight: event.detail.height
    })
  },

  onLockChange(event) {
    this.setData({
      lockRatio: event.detail.lockRatio,
      customWidth: event.detail.width,
      customHeight: event.detail.height
    })
  },

  onBackgroundChange(event) {
    this.setData({ backgroundMode: event.detail.value })
  },

  onColorChange(event) {
    const isCustom = event.detail.mode === 'custom'
    this.setData({
      colorMode: event.detail.mode,
      colorLimit: event.detail.value,
      customColorLimit: isCustom ? event.detail.value : this.data.customColorLimit
    })
  },

  onCustomColorChange(event) {
    this.setData({
      colorMode: 'custom',
      colorLimit: event.detail.value,
      customColorLimit: event.detail.value
    })
  },

  async onGenerate() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先上传一张图片', icon: 'none' })
      return
    }

    if (this.data.sizeMode === 'custom' && (!this.data.customWidth || !this.data.customHeight)) {
      wx.showToast({ title: '请填写有效的图纸尺寸', icon: 'none' })
      return
    }

    if (!this.data.colorLimit) {
      wx.showToast({ title: '颜色上限需为 1–64', icon: 'none' })
      return
    }

    if (this.data.isGenerating) return
    this.setData({ isGenerating: true })
    wx.showLoading({ title: '读取图片', mask: true })

    try {
      const { width, height } = this.getTargetSize()
      const samples = await this.sampleUploadedImage(width, height)
      const pattern = await PatternGenerator.generatePattern({
        samples,
        width,
        height,
        colorLimit: this.data.colorLimit,
        backgroundMode: this.data.backgroundMode,
        palette: MARD221,
        onProgress: (progress, label) => {
          if (progress > 0.2) wx.showLoading({ title: label, mask: true })
        },
        yieldControl: () => new Promise(resolve => setTimeout(resolve, 0))
      })

      getApp().globalData.currentPattern = {
        ...pattern,
        sourceImage: this.data.imagePath,
        sourceWidth: this.data.imageWidth,
        sourceHeight: this.data.imageHeight
      }
      wx.hideLoading()
      wx.navigateTo({ url: '/pages/result/index' })
    } catch (error) {
      console.error('Pattern generation failed', error)
      wx.hideLoading()
      wx.showToast({ title: '生成失败，请换张图片重试', icon: 'none' })
    } finally {
      this.setData({ isGenerating: false })
    }
  },

  getTargetSize() {
    if (this.data.sizeMode === 'custom') {
      return {
        width: Math.max(1, Math.floor(this.data.customWidth)),
        height: Math.max(1, Math.floor(this.data.customHeight))
      }
    }
    const [width, height] = this.data.selectedPreset.split('x').map(Number)
    return { width, height }
  },

  sampleUploadedImage(width, height) {
    return new Promise((resolve, reject) => {
      this.createSelectorQuery()
        .select('#processorCanvas')
        .fields({ node: true, size: true })
        .exec(result => {
          const canvas = result && result[0] && result[0].node
          if (!canvas) {
            reject(new Error('Processing canvas is unavailable'))
            return
          }

          const oversample = 4
          canvas.width = width * oversample
          canvas.height = height * oversample
          const context = canvas.getContext('2d')
          context.imageSmoothingEnabled = true
          context.imageSmoothingQuality = 'high'
          const image = canvas.createImage()
          image.onload = () => {
            try {
              context.clearRect(0, 0, canvas.width, canvas.height)
              context.fillStyle = '#FFFFFF'
              context.fillRect(0, 0, canvas.width, canvas.height)
              context.drawImage(image, 0, 0, canvas.width, canvas.height)
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
              resolve(Sampler.sampleImageData(imageData, canvas.width, canvas.height, width, height))
            } catch (error) {
              reject(error)
            }
          }
          image.onerror = reject
          image.src = this.data.imagePath
        })
    })
  },

  onNavChange(event) {
    const target = event.detail.value
    if (target === 'create') return

    if (target === 'library') {
      wx.navigateTo({ url: '/pages/library/index' })
      return
    }
    wx.showToast({ title: '毛毡板功能即将上线', icon: 'none' })
  }
})
