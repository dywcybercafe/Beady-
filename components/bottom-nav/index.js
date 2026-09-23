Component({
  properties: {
    current: { type: String, value: 'create' }
  },

  methods: {
    selectItem(event) {
      this.triggerEvent('change', { value: event.currentTarget.dataset.value })
    }
  }
})
