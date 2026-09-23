Component({
  properties: {
    value: { type: String, value: 'keep' }
  },

  methods: {
    selectOption(event) {
      this.triggerEvent('change', { value: event.currentTarget.dataset.value })
    }
  }
})
