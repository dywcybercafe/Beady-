const PRESETS = [
  { label: '52 × 52', value: '52x52' },
  { label: '78 × 78', value: '78x78' },
  { label: '104 × 104', value: '104x104' },
  { label: '120 × 120', value: '120x120' }
]

Component({
  properties: {
    mode: { type: String, value: 'preset' },
    preset: { type: String, value: '78x78' },
    customWidth: { type: Number, value: 113 },
    customHeight: { type: Number, value: 78 },
    lockRatio: { type: Boolean, value: true },
    imageRatio: { type: Number, value: 1 }
  },

  data: { presets: PRESETS },

  methods: {
    selectPreset(event) {
      this.triggerEvent('presetchange', { value: event.currentTarget.dataset.value })
    },

    openCustom() {
      this.triggerEvent('modechange', { value: 'custom' })
    },

    onWidthInput(event) {
      const width = this.normalizeInput(event.detail.value)
      let height = this.data.customHeight
      if (this.data.lockRatio && width > 0) {
        height = Math.max(1, Math.round(width / this.safeRatio()))
      }
      this.triggerEvent('customchange', { width, height })
    },

    onHeightInput(event) {
      const height = this.normalizeInput(event.detail.value)
      let width = this.data.customWidth
      if (this.data.lockRatio && height > 0) {
        width = Math.max(1, Math.round(height * this.safeRatio()))
      }
      this.triggerEvent('customchange', { width, height })
    },

    toggleLock() {
      const lockRatio = !this.data.lockRatio
      let width = this.data.customWidth
      let height = this.data.customHeight
      if (lockRatio && width > 0) {
        height = Math.max(1, Math.round(width / this.safeRatio()))
      }
      this.triggerEvent('lockchange', { lockRatio, width, height })
    },

    normalizeInput(value) {
      if (value === '') return 0
      return Math.max(0, Math.min(999, Number(value) || 0))
    },

    safeRatio() {
      const ratio = Number(this.data.imageRatio)
      return ratio > 0 ? ratio : 1
    }
  }
})
