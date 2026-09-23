const OPTIONS = [16, 24, 32, 48]

Component({
  properties: {
    mode: { type: String, value: 'preset' },
    value: { type: Number, value: 24 },
    customValue: { type: Number, value: 24 }
  },

  data: { options: OPTIONS },

  methods: {
    noop() {},

    selectPreset(event) {
      this.triggerEvent('change', {
        mode: 'preset',
        value: Number(event.currentTarget.dataset.value)
      })
    },

    openCustom() {
      this.triggerEvent('change', {
        mode: 'custom',
        value: this.data.customValue || 24
      })
    },

    onCustomInput(event) {
      const raw = event.detail.value
      const value = raw === '' ? 0 : Math.min(64, Math.max(0, Number(raw) || 0))
      this.triggerEvent('customchange', { value })
    },

    normalizeCustom() {
      const value = Math.min(64, Math.max(1, Number(this.data.customValue) || 24))
      this.triggerEvent('customchange', { value })
    }
  }
})
