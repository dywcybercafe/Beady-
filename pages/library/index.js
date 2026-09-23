const LibraryStore = require('../../services/libraryStore')
const GridRecognizer = require('../../services/image/beadGridRecognizer')

const shelfConfig = [
  { theme: 'pink', cloud: '/assets/images/library/cloud-pink.png?v=4', side: 'left' },
  { theme: 'blue', cloud: '/assets/images/library/cloud-blue.png?v=4', side: 'right' },
  { theme: 'green', cloud: '/assets/images/library/cloud-green.png?v=4', side: 'left' },
  { theme: 'yellow', cloud: '/assets/images/library/cloud-yellow.png?v=4', side: 'right' }
]

Page({
  data: {
    currentNav: 'library',
    shelves: [],
    searchVisible: false,
    searchText: ''
  },

  onShow() {
    const saved = LibraryStore.loadSavedPatterns()
      .filter(item => item.imagePath || (item.pattern && item.pattern.sourceImage))
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    this.allItems = saved.map((item, index) => this.prepareItem(item, index))
    this.buildShelves(this.allItems)
  },

  prepareItem(item, libraryIndex) {
    const width = Math.max(1, Number(item.width) || 1)
    const height = Math.max(1, Number(item.height) || 1)
    const scale = Math.min(300 / width, 198 / height)
    const next = {
      ...item,
      imagePath: item.imagePath || (item.pattern && item.pattern.sourceImage) || '',
      displayWidth: Math.max(1, Math.round(width * scale)),
      displayHeight: Math.max(1, Math.round(height * scale)),
      shelfIndex: Math.floor(libraryIndex / 4) % shelfConfig.length,
      favorite: Boolean(item.favorite)
    }
    return next
  },

  buildShelves(items) {
    this.shelfScrollLeft = [0, 0, 0, 0]
    const shelves = shelfConfig.map((config, index) => ({
      ...config,
      scrollLeft: 0,
      items: items
        .filter(item => item.shelfIndex === index)
        .sort((first, second) => Number(second.favorite) - Number(first.favorite))
    }))
    this.setData({ shelves })
  },

  toggleSearch() {
    const searchVisible = !this.data.searchVisible
    this.setData({ searchVisible, searchText: '' })
    if (!searchVisible) this.buildShelves(this.allItems)
  },

  onSearchInput(event) {
    const searchText = event.detail.value
    const normalized = searchText.trim().toLowerCase()
    const items = normalized ? this.allItems.filter(item => `${item.title} ${item.width}x${item.height}`.toLowerCase().includes(normalized)) : this.allItems
    this.setData({ searchText })
    this.buildShelves(items)
  },

  moveShelf(event) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const key = `shelves[${index}].scrollLeft`
    const next = Math.max(0, (this.shelfScrollLeft[index] || 0) + direction * 360)
    this.shelfScrollLeft[index] = next
    this.setData({ [key]: next })
  },

  onShelfScroll(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.shelfScrollLeft[index] = event.detail.scrollLeft
  },

  openPattern(event) {
    const id = event.currentTarget.dataset.id
    const item = this.allItems.find(entry => entry.id === id)
    if (!item) return
    this.selectedItem = item
    wx.showActionSheet({
      itemList: ['放到工作台', item.favorite ? '取消喜爱' : '标记喜爱', '删除图纸'],
      success: result => {
        if (result.tapIndex === 0) this.putOnWorkbench(item)
        if (result.tapIndex === 1) this.toggleFavorite(item)
        if (result.tapIndex === 2) this.deletePattern(item)
      }
    })
  },

  putOnWorkbench(item) {
    if (item.pattern) {
      getApp().globalData.currentPattern = item.pattern
      wx.navigateTo({ url: '/pages/result/index' })
      return
    }
    if (item.analysis) {
      this.openExternalWorkbench(item, item.analysis)
      return
    }
    this.analyzeExternalPattern(item)
  },

  analyzeExternalPattern(item) {
    if (!wx.createOffscreenCanvas || !item.imagePath) {
      wx.showToast({ title: '当前环境无法识别网格', icon: 'none' })
      return
    }
    wx.showLoading({ title: '正在识别豆子网格' })
    const maxSide = 640
    const scale = Math.min(1, maxSide / Math.max(item.width, item.height))
    const width = Math.max(1, Math.round(item.width * scale))
    const height = Math.max(1, Math.round(item.height * scale))
    const canvas = wx.createOffscreenCanvas({ type: '2d', width, height })
    const context = canvas.getContext('2d')
    const image = canvas.createImage()
    image.onload = () => {
      context.drawImage(image, 0, 0, width, height)
      const imageData = context.getImageData(0, 0, width, height)
      const analysis = GridRecognizer.recognize(imageData, width, height)
      wx.hideLoading()
      if (analysis.reliable) {
        LibraryStore.updateItem(item.id, { analysis })
        this.openExternalWorkbench(item, analysis)
        return
      }
      wx.showModal({
        title: '确认图纸有效区域',
        content: '自动识别置信度较低。是否确认整张上传图片都是需要识别的拼豆区域？',
        confirmText: '确认整张',
        cancelText: '暂不识别',
        success: result => {
          if (!result.confirm) return
          if (analysis.width < 3 || analysis.height < 3) {
            wx.showToast({ title: '未识别到规则网格', icon: 'none' })
            return
          }
          const confirmed = GridRecognizer.recognize(imageData, width, height, {
            region: { x: 0, y: 0, width, height, columns: analysis.width, rows: analysis.height }
          })
          LibraryStore.updateItem(item.id, { analysis: { ...confirmed, confirmed: true } })
          this.openExternalWorkbench(item, { ...confirmed, confirmed: true })
        }
      })
    }
    image.onerror = () => { wx.hideLoading(); wx.showToast({ title: '无法读取图纸图片', icon: 'none' }) }
    image.src = item.imagePath
  },

  openExternalWorkbench(item, analysis) {
    getApp().globalData.currentPattern = {
      type: 'external',
      width: analysis.width,
      height: analysis.height,
      cells: analysis.cells,
      colors: analysis.colors,
      sourceImage: item.imagePath,
      sourceRegion: analysis.region,
      colorLimit: analysis.colors.length,
      backgroundMode: 'original'
    }
    wx.navigateTo({ url: '/pages/result/index' })
  },

  openAddSheet() {
    wx.showActionSheet({
      itemList: ['保存当前图纸到图库', '上传自己的图纸'],
      success: result => {
        if (result.tapIndex === 0) this.saveCurrentPattern()
        if (result.tapIndex === 1) this.uploadOwnPattern()
      }
    })
  },

  saveCurrentPattern() {
    const pattern = getApp().globalData.currentPattern
    if (!pattern || !pattern.sourceImage) {
      wx.showToast({ title: '暂无可保存的图纸', icon: 'none' })
      return
    }
    wx.getImageInfo({
      src: pattern.sourceImage,
      success: info => {
        wx.saveFile({
          tempFilePath: pattern.sourceImage,
          success: saved => this.finishSavingPattern(pattern, saved.savedFilePath, info.width, info.height, true),
          fail: () => this.finishSavingPattern(pattern, pattern.sourceImage, info.width, info.height, false)
        })
      },
      fail: () => wx.showToast({ title: '无法读取原始图片', icon: 'none' })
    })
  },

  finishSavingPattern(pattern, imagePath, width, height, ownsImageFile) {
    const storedPattern = { ...pattern, sourceImage: imagePath, sourceWidth: width, sourceHeight: height }
    getApp().globalData.currentPattern = storedPattern
    LibraryStore.savePattern(storedPattern, { imagePath, width, height, ownsImageFile })
    wx.showToast({ title: '已保存到图纸库', icon: 'success' })
    this.onShow()
  },

  uploadOwnPattern() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: result => {
        const sourcePath = result.tempFiles[0].tempFilePath
        wx.getImageInfo({
          src: sourcePath,
          success: info => wx.saveFile({
            tempFilePath: sourcePath,
            success: saved => {
              LibraryStore.saveImportedImage({ path: saved.savedFilePath, width: info.width, height: info.height, title: '上传图纸' })
              wx.showToast({ title: '已添加到图纸库', icon: 'success' })
              this.onShow()
            },
            fail: () => wx.showToast({ title: '保存图片失败', icon: 'none' })
          }),
          fail: () => wx.showToast({ title: '无法读取图片', icon: 'none' })
        })
      }
    })
  },

  toggleFavorite(item) {
    const favorite = !item.favorite
    LibraryStore.updateItem(item.id, { favorite })
    this.onShow()
  },

  deletePattern(item) {
    LibraryStore.deleteItem(item.id)
    if (item.ownsImageFile && item.imagePath) wx.removeSavedFile({ filePath: item.imagePath })
    wx.showToast({ title: '已删除', icon: 'success' })
    this.onShow()
  },

  onNavChange(event) {
    const target = event.detail.value
    if (target === 'library') return
    if (target === 'create') {
      wx.redirectTo({ url: '/pages/home/index' })
      return
    }
    wx.showToast({ title: '毛毡板功能即将上线', icon: 'none' })
  }
})
