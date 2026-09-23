const MARD221 = require('../../data/mard221')
const ColorSpace = require('../../services/image/colorSpace')

const CELL_SIZE = 14
const MIN_VISIBLE_SCALE = 0.12
const MAX_SCALE = 3.6

Page({
  data: {
    width: 0,
    height: 0,
    colors: [],
    totalBeads: 0,
    selectedCode: '',
    zoomLabel: '100%'
  },

  onLoad() {
    this.pattern = getApp().globalData.currentPattern
    if (!this.pattern) {
      wx.showToast({ title: '暂无图纸数据', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    this.paletteByCode = MARD221.reduce((result, color) => {
      result[color.code] = color
      return result
    }, {})
    this.isExternal = this.pattern.type === 'external'
    this.patternColorByCode = {}
    const largestCount = this.pattern.colors[0] ? this.pattern.colors[0].count : 1
    const colors = this.pattern.colors.map(item => ({
      ...item,
      hex: item.hex || (this.paletteByCode[item.code] && this.paletteByCode[item.code].hex) || '#CCCCCC',
      percent: Math.max(8, Math.round(item.count / largestCount * 100))
    }))
    colors.forEach(color => { this.patternColorByCode[color.code] = color })

    this.setData({
      width: this.pattern.width,
      height: this.pattern.height,
      colors,
      totalBeads: this.pattern.width * this.pattern.height
    })
  },

  onReady() {
    if (!this.pattern) return
    this.createSelectorQuery()
      .select('#patternCanvas')
      .fields({ node: true, size: true, rect: true })
      .exec(result => {
        const info = result && result[0]
        if (!info || !info.node) return
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        this.canvas = info.node
        this.context = this.canvas.getContext('2d')
        this.viewportWidth = info.width
        this.viewportHeight = info.height
        this.canvasLeft = info.left || 0
        this.canvasTop = info.top || 0
        this.pixelRatio = windowInfo.pixelRatio || 2
        this.canvas.width = Math.round(info.width * this.pixelRatio)
        this.canvas.height = Math.round(info.height * this.pixelRatio)

        const patternWidth = this.pattern.width * CELL_SIZE
        const patternHeight = this.pattern.height * CELL_SIZE
        const region = this.isExternal ? (this.pattern.sourceRegion || { x: 0, y: 0, width: 1, height: 1 }) : { x: 0, y: 0, width: 1, height: 1 }
        this.worldBounds = this.isExternal
          ? { x: -region.x / region.width * patternWidth, y: -region.y / region.height * patternHeight, width: patternWidth / region.width, height: patternHeight / region.height }
          : { x: 0, y: 0, width: patternWidth, height: patternHeight }
        this.fitScale = Math.min((info.width - 24) / this.worldBounds.width, (info.height - 24) / this.worldBounds.height)
        this.scale = Math.max(MIN_VISIBLE_SCALE, this.fitScale)
        this.offsetX = (info.width - this.worldBounds.width * this.scale) / 2 - this.worldBounds.x * this.scale
        this.offsetY = (info.height - this.worldBounds.height * this.scale) / 2 - this.worldBounds.y * this.scale
        this.updateZoomLabel()
        if (this.isExternal) {
          this.sourceImage = this.canvas.createImage()
          this.sourceImage.onload = () => this.drawPattern()
          this.sourceImage.onerror = () => wx.showToast({ title: '无法读取原始图纸', icon: 'none' })
          this.sourceImage.src = this.pattern.sourceImage
        } else {
          this.drawPattern()
        }
      })
  },

  drawPattern() {
    if (!this.context || !this.pattern) return
    const context = this.context
    const screenCell = CELL_SIZE * this.scale
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    context.clearRect(0, 0, this.viewportWidth, this.viewportHeight)
    context.fillStyle = '#F4F4F8'
    context.fillRect(0, 0, this.viewportWidth, this.viewportHeight)
    context.save()
    context.translate(this.offsetX, this.offsetY)
    context.scale(this.scale, this.scale)

    const selectedCode = this.data.selectedCode
    if (this.isExternal && this.sourceImage) {
      context.globalAlpha = 1
      context.drawImage(this.sourceImage, this.worldBounds.x, this.worldBounds.y, this.worldBounds.width, this.worldBounds.height)
      for (let y = 0; y < this.pattern.height; y += 1) {
        for (let x = 0; x < this.pattern.width; x += 1) {
          const code = this.pattern.cells[y][x]
          const isSelected = selectedCode && code === selectedCode
          if (selectedCode && !isSelected) {
            context.fillStyle = 'rgba(247,247,251,.78)'
            context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          }
          if (isSelected) {
            context.strokeStyle = '#2D214F'
            context.lineWidth = 1.5 / this.scale
            context.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          } else if (screenCell >= 8) {
            context.strokeStyle = 'rgba(52,52,65,.1)'
            context.lineWidth = 0.4 / this.scale
            context.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          }
        }
      }
      context.strokeStyle = '#292933'
      context.lineWidth = 1.2 / this.scale
      context.strokeRect(0, 0, this.pattern.width * CELL_SIZE, this.pattern.height * CELL_SIZE)
      context.restore()
      return
    }

    for (let y = 0; y < this.pattern.height; y += 1) {
      for (let x = 0; x < this.pattern.width; x += 1) {
        const code = this.pattern.cells[y][x]
        const color = this.paletteByCode[code]
        const isDimmed = selectedCode && code !== selectedCode
        context.globalAlpha = isDimmed ? 0.14 : 1
        context.fillStyle = color.hex
        context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)

        if (screenCell >= 5) {
          context.strokeStyle = selectedCode && code === selectedCode ? '#2D214F' : 'rgba(52,52,65,.16)'
          context.lineWidth = selectedCode && code === selectedCode ? 1.4 / this.scale : 0.5 / this.scale
          context.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        }

        if (screenCell >= 20 && !isDimmed) {
          context.fillStyle = ColorSpace.relativeLuminance(color.rgb) > 0.48 ? '#23232C' : '#FFFFFF'
          context.font = `600 ${CELL_SIZE * 0.39}px sans-serif`
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText(code, x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2)
        }
      }
    }

    context.globalAlpha = 1
    context.strokeStyle = '#292933'
    context.lineWidth = 1.2 / this.scale
    context.strokeRect(0, 0, this.pattern.width * CELL_SIZE, this.pattern.height * CELL_SIZE)
    context.restore()
  },

  onCanvasTouchStart(event) {
    const touches = event.touches.map(touch => this.normalizeTouch(touch))
    this.touchMoved = false
    this.touchStartTime = Date.now()
    if (touches.length === 1) {
      this.lastTouch = { x: touches[0].x, y: touches[0].y }
      this.tapStart = { ...this.lastTouch }
    } else if (touches.length >= 2) {
      this.pinchStart = this.getPinchState(touches)
      this.pinchScale = this.scale
    }
  },

  onCanvasTouchMove(event) {
    const touches = event.touches.map(touch => this.normalizeTouch(touch))
    if (touches.length === 1 && this.lastTouch) {
      const dx = touches[0].x - this.lastTouch.x
      const dy = touches[0].y - this.lastTouch.y
      if (Math.abs(dx) + Math.abs(dy) > 2) this.touchMoved = true
      this.offsetX += dx
      this.offsetY += dy
      this.lastTouch = { x: touches[0].x, y: touches[0].y }
      this.drawPattern()
    } else if (touches.length >= 2 && this.pinchStart) {
      const pinch = this.getPinchState(touches)
      const nextScale = Math.max(this.fitScale * 0.75, Math.min(MAX_SCALE, this.pinchScale * pinch.distance / this.pinchStart.distance))
      this.zoomAt(nextScale, pinch.centerX, pinch.centerY)
      this.touchMoved = true
    }
  },

  onCanvasTouchEnd(event) {
    if (!this.touchMoved && this.tapStart && Date.now() - this.touchStartTime < 450) {
      const x = Math.floor((this.tapStart.x - this.offsetX) / (CELL_SIZE * this.scale))
      const y = Math.floor((this.tapStart.y - this.offsetY) / (CELL_SIZE * this.scale))
      if (x >= 0 && x < this.pattern.width && y >= 0 && y < this.pattern.height) {
        this.toggleColor(this.pattern.cells[y][x])
      }
    }
    this.lastTouch = null
    this.pinchStart = null
    this.tapStart = null
  },

  getPinchState(touches) {
    const dx = touches[1].x - touches[0].x
    const dy = touches[1].y - touches[0].y
    return {
      distance: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
      centerX: (touches[0].x + touches[1].x) / 2,
      centerY: (touches[0].y + touches[1].y) / 2
    }
  },

  normalizeTouch(touch) {
    return {
      x: touch.x !== undefined ? touch.x : touch.clientX - this.canvasLeft,
      y: touch.y !== undefined ? touch.y : touch.clientY - this.canvasTop
    }
  },

  zoomAt(nextScale, centerX, centerY) {
    const worldX = (centerX - this.offsetX) / this.scale
    const worldY = (centerY - this.offsetY) / this.scale
    this.scale = nextScale
    this.offsetX = centerX - worldX * nextScale
    this.offsetY = centerY - worldY * nextScale
    this.updateZoomLabel()
    this.drawPattern()
  },

  zoomIn() {
    this.zoomAt(Math.min(MAX_SCALE, this.scale * 1.35), this.viewportWidth / 2, this.viewportHeight / 2)
  },

  zoomOut() {
    this.zoomAt(Math.max(this.fitScale * 0.75, this.scale / 1.35), this.viewportWidth / 2, this.viewportHeight / 2)
  },

  updateZoomLabel() {
    if (!this.fitScale) return
    this.setData({ zoomLabel: `${Math.round(this.scale / this.fitScale * 100)}%` })
  },

  selectColor(event) {
    this.toggleColor(event.currentTarget.dataset.code)
  },

  toggleColor(code) {
    this.setData({ selectedCode: this.data.selectedCode === code ? '' : code }, () => this.drawPattern())
  },

  clearSelection() {
    this.setData({ selectedCode: '' }, () => this.drawPattern())
  },

  goBack() {
    wx.navigateBack()
  }
})
