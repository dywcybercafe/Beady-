Component({
  properties: {
    imagePath: {
      type: String,
      value: ''
    }
  },

  methods: {
    chooseImage() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: ({ tempFiles }) => {
          const file = tempFiles && tempFiles[0]
          if (!file) return

          this.triggerEvent('change', {
            path: file.tempFilePath,
            width: file.width || 1,
            height: file.height || 1
          })
        },
        fail: (error) => {
          if (error.errMsg && error.errMsg.indexOf('cancel') === -1) {
            wx.showToast({ title: '图片选择失败', icon: 'none' })
          }
        }
      })
    },

    removeImage() {
      this.triggerEvent('remove')
    }
  }
})
