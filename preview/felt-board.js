(function createFeltBoard(global) {
  const viewElement = document.querySelector('#feltView')
  const canvas = document.querySelector('#feltCanvas')
  const world = document.querySelector('#feltWorld')
  const emptyState = document.querySelector('#feltEmpty')
  const hint = document.querySelector('#feltHint')
  const fileInput = document.querySelector('#feltFileInput')
  const gallery = document.querySelector('#feltGallery')
  const galleryBackdrop = document.querySelector('#feltGalleryBackdrop')
  const galleryGrid = document.querySelector('#feltGalleryGrid')
  const state = {
    objects: [],
    selectedId: '',
    view: { x: 0, y: 0, scale: 1 },
    history: [[]],
    historyIndex: 0,
    canvasPointers: new Map(),
    artPointers: new Map(),
    initialized: false,
    artworks: []
  }

  const cloneObjects = objects => objects.map(item => ({ ...item }))
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  function updateWorldTransform() {
    world.style.transform = `translate(${state.view.x}px,${state.view.y}px) scale(${state.view.scale})`
    const textureSize = 620 * state.view.scale
    canvas.style.backgroundSize = `auto, ${textureSize}px auto`
    canvas.style.backgroundPosition = `0 0, ${state.view.x % textureSize}px ${state.view.y % textureSize}px`
  }

  function objectTransform(item) {
    return `translate(${item.x - item.width / 2}px,${item.y - item.height / 2}px) rotate(${item.rotation}deg) scale(${item.scale})`
  }

  function renderObjectTransform(id) {
    const item = state.objects.find(object => object.id === id)
    const element = world.querySelector(`[data-art-id="${id}"]`)
    if (item && element) element.style.transform = objectTransform(item)
  }

  function renderObjects() {
    world.innerHTML = ''
    state.objects.forEach(item => {
      const element = document.createElement('div')
      element.className = `felt-art${item.id === state.selectedId ? ' selected' : ''}`
      element.dataset.artId = item.id
      element.style.width = `${item.width}px`
      element.style.height = `${item.height}px`
      element.style.transform = objectTransform(item)
      element.innerHTML = `<img src="${item.dataUrl}" alt="${item.name || '拼豆作品'}" draggable="false">
        <div class="felt-editor" aria-hidden="${item.id === state.selectedId ? 'false' : 'true'}">
          <button class="felt-scale-handle nw" type="button" data-edit-action="scale" aria-label="等比缩放左上角"></button>
          <button class="felt-scale-handle ne" type="button" data-edit-action="scale" aria-label="等比缩放右上角"></button>
          <button class="felt-scale-handle sw" type="button" data-edit-action="scale" aria-label="等比缩放左下角"></button>
          <button class="felt-scale-handle se" type="button" data-edit-action="scale" aria-label="等比缩放右下角"></button>
          <span class="felt-rotate-stem"></span>
          <button class="felt-rotate-handle" type="button" data-edit-action="rotate" aria-label="自由旋转"></button>
          <button class="felt-delete-handle" type="button" data-edit-action="delete" aria-label="删除当前作品">×</button>
        </div>`
      element.addEventListener('pointerdown', startArtGesture)
      element.querySelectorAll('[data-edit-action="scale"],[data-edit-action="rotate"]').forEach(handle => {
        handle.addEventListener('pointerdown', startHandleGesture)
        handle.addEventListener('pointermove', moveHandleGesture)
        handle.addEventListener('pointerup', endHandleGesture)
        handle.addEventListener('pointercancel', endHandleGesture)
      })
      element.querySelector('[data-edit-action="delete"]').addEventListener('pointerdown', event => {
        event.preventDefault()
        event.stopPropagation()
      })
      element.querySelector('[data-edit-action="delete"]').addEventListener('click', deleteSelectedObject)
      world.appendChild(element)
    })
    emptyState.hidden = state.objects.length > 0
    updateHistoryButtons()
  }

  function selectObject(id) {
    state.selectedId = id
    world.querySelectorAll('.felt-art').forEach(element => {
      const selected = element.dataset.artId === id
      element.classList.toggle('selected', selected)
      const editor = element.querySelector('.felt-editor')
      if (editor) editor.setAttribute('aria-hidden', selected ? 'false' : 'true')
    })
  }

  function objectCenterOnScreen(item) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + state.view.x + item.x * state.view.scale,
      y: rect.top + state.view.y + item.y * state.view.scale
    }
  }

  function startHandleGesture(event) {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const element = handle.closest('.felt-art')
    const item = state.objects.find(object => object.id === element.dataset.artId)
    if (!item) return
    selectObject(item.id)
    handle.setPointerCapture(event.pointerId)
    const center = objectCenterOnScreen(item)
    const dx = event.clientX - center.x
    const dy = event.clientY - center.y
    state.handleGesture = {
      pointerId: event.pointerId,
      id: item.id,
      action: handle.dataset.editAction,
      center,
      startDistance: Math.max(1, Math.hypot(dx, dy)),
      startAngle: Math.atan2(dy, dx) * 180 / Math.PI,
      baseScale: item.scale,
      baseRotation: item.rotation,
      moved: false
    }
  }

  function moveHandleGesture(event) {
    const gesture = state.handleGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const item = state.objects.find(object => object.id === gesture.id)
    if (!item) return
    const dx = event.clientX - gesture.center.x
    const dy = event.clientY - gesture.center.y
    if (gesture.action === 'scale') {
      const distance = Math.max(1, Math.hypot(dx, dy))
      item.scale = Math.max(.18, Math.min(6, gesture.baseScale * distance / gesture.startDistance))
    } else {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      item.rotation = gesture.baseRotation + angle - gesture.startAngle
    }
    gesture.moved = true
    renderObjectTransform(item.id)
  }

  function endHandleGesture(event) {
    const gesture = state.handleGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (gesture.moved) commitHistory()
    state.handleGesture = null
  }

  function deleteSelectedObject(event) {
    event.preventDefault()
    event.stopPropagation()
    const element = event.currentTarget.closest('.felt-art')
    const id = element && element.dataset.artId
    if (!id) return
    state.objects = state.objects.filter(object => object.id !== id)
    state.selectedId = ''
    state.artPointers.clear()
    state.artGesture = null
    state.handleGesture = null
    renderObjects()
    commitHistory()
  }

  function commitHistory() {
    const next = cloneObjects(state.objects)
    state.history = state.history.slice(0, state.historyIndex + 1)
    state.history.push(next)
    state.historyIndex = state.history.length - 1
    updateHistoryButtons()
  }

  function updateHistoryButtons() {
    document.querySelector('#feltUndo').disabled = state.historyIndex <= 0
    document.querySelector('#feltRedo').disabled = state.historyIndex >= state.history.length - 1
  }

  function restoreHistory(index) {
    if (index < 0 || index >= state.history.length) return
    state.historyIndex = index
    state.objects = cloneObjects(state.history[index])
    if (!state.objects.some(item => item.id === state.selectedId)) state.selectedId = ''
    renderObjects()
  }

  function viewportCenterInWorld() {
    return {
      x: (canvas.clientWidth / 2 - state.view.x) / state.view.scale,
      y: (canvas.clientHeight / 2 - state.view.y) / state.view.scale
    }
  }

  function addArtwork(artwork) {
    const center = viewportCenterInWorld()
    const target = Math.min(210 / state.view.scale, canvas.clientWidth * .52 / state.view.scale)
    const factor = target / Math.max(artwork.width, artwork.height)
    state.objects.push({
      id: uid('art'), sourceId: artwork.id, name: artwork.name,
      dataUrl: artwork.dataUrl, x: center.x, y: center.y,
      width: artwork.width * factor, height: artwork.height * factor,
      scale: 1, rotation: 0
    })
    state.selectedId = state.objects[state.objects.length - 1].id
    renderObjects()
    commitHistory()
    hint.classList.add('dismissed')
  }

  function startArtGesture(event) {
    if (event.target.closest('[data-edit-action]')) return
    event.preventDefault()
    event.stopPropagation()
    const element = event.currentTarget
    const id = element.dataset.artId
    selectObject(id)
    element.setPointerCapture(event.pointerId)
    state.artPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!state.artGesture || state.artGesture.id !== id || state.artPointers.size === 1) {
      const item = state.objects.find(object => object.id === id)
      state.artGesture = { id, before: { ...item }, moved: false }
    }
    resetArtGestureOrigin()
  }

  function pointerGeometry(points) {
    const first = points[0]
    const second = points[1] || first
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      angle: Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI
    }
  }

  function resetArtGestureOrigin() {
    if (!state.artGesture) return
    const item = state.objects.find(object => object.id === state.artGesture.id)
    const geometry = pointerGeometry(Array.from(state.artPointers.values()))
    state.artGesture.origin = geometry
    state.artGesture.base = { x: item.x, y: item.y, scale: item.scale, rotation: item.rotation }
  }

  function moveArtGesture(event) {
    if (!state.artPointers.has(event.pointerId) || !state.artGesture) return
    event.preventDefault()
    state.artPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const geometry = pointerGeometry(Array.from(state.artPointers.values()))
    const gesture = state.artGesture
    const item = state.objects.find(object => object.id === gesture.id)
    if (!item) return
    const dx = geometry.x - gesture.origin.x
    const dy = geometry.y - gesture.origin.y
    if (Math.abs(dx) + Math.abs(dy) > 2 || state.artPointers.size > 1) gesture.moved = true
    item.x = gesture.base.x + dx / state.view.scale
    item.y = gesture.base.y + dy / state.view.scale
    if (state.artPointers.size > 1) {
      item.scale = Math.max(.18, Math.min(6, gesture.base.scale * geometry.distance / gesture.origin.distance))
      item.rotation = gesture.base.rotation + geometry.angle - gesture.origin.angle
    }
    renderObjectTransform(item.id)
  }

  function endArtGesture(event) {
    if (!state.artPointers.has(event.pointerId)) return
    state.artPointers.delete(event.pointerId)
    if (state.artPointers.size) {
      resetArtGestureOrigin()
      return
    }
    if (state.artGesture && state.artGesture.moved) commitHistory()
    state.artGesture = null
  }

  function startCanvasGesture(event) {
    if (event.target.closest('.felt-art')) return
    event.preventDefault()
    selectObject('')
    canvas.setPointerCapture(event.pointerId)
    state.canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    resetCanvasGestureOrigin()
    canvas.classList.add('dragging')
    hint.classList.add('dismissed')
  }

  function resetCanvasGestureOrigin() {
    const geometry = pointerGeometry(Array.from(state.canvasPointers.values()))
    state.canvasGesture = { origin: geometry, x: state.view.x, y: state.view.y, scale: state.view.scale }
  }

  function moveCanvasGesture(event) {
    if (!state.canvasPointers.has(event.pointerId)) return
    event.preventDefault()
    state.canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const geometry = pointerGeometry(Array.from(state.canvasPointers.values()))
    const gesture = state.canvasGesture
    if (state.canvasPointers.size === 1) {
      state.view.x = gesture.x + geometry.x - gesture.origin.x
      state.view.y = gesture.y + geometry.y - gesture.origin.y
    } else {
      const nextScale = Math.max(.15, Math.min(4, gesture.scale * geometry.distance / gesture.origin.distance))
      const worldX = (gesture.origin.x - canvas.getBoundingClientRect().left - gesture.x) / gesture.scale
      const worldY = (gesture.origin.y - canvas.getBoundingClientRect().top - gesture.y) / gesture.scale
      state.view.scale = nextScale
      state.view.x = geometry.x - canvas.getBoundingClientRect().left - worldX * nextScale
      state.view.y = geometry.y - canvas.getBoundingClientRect().top - worldY * nextScale
    }
    updateWorldTransform()
  }

  function endCanvasGesture(event) {
    state.canvasPointers.delete(event.pointerId)
    if (state.canvasPointers.size) resetCanvasGestureOrigin()
    else canvas.classList.remove('dragging')
  }

  function fitToScreen() {
    if (!state.objects.length) {
      state.view = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, scale: 1 }
      updateWorldTransform()
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    state.objects.forEach(item => {
      const radians = item.rotation * Math.PI / 180
      const halfWidth = item.width * item.scale / 2
      const halfHeight = item.height * item.scale / 2
      const extentX = Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight
      const extentY = Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight
      minX = Math.min(minX, item.x - extentX); maxX = Math.max(maxX, item.x + extentX)
      minY = Math.min(minY, item.y - extentY); maxY = Math.max(maxY, item.y + extentY)
    })
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)
    const scale = Math.max(.15, Math.min(3, Math.min(canvas.clientWidth * .76 / width, canvas.clientHeight * .72 / height)))
    state.view.scale = scale
    state.view.x = canvas.clientWidth / 2 - (minX + maxX) / 2 * scale
    state.view.y = canvas.clientHeight / 2 - (minY + maxY) / 2 * scale + 12
    updateWorldTransform()
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('beady-felt-artworks', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('artworks', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async function saveArtwork(artwork) {
    try {
      const db = await openDatabase()
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('artworks', 'readwrite')
        transaction.objectStore('artworks').put(artwork)
        transaction.oncomplete = resolve
        transaction.onerror = () => reject(transaction.error)
      })
      db.close()
    } catch (error) { console.warn('Artwork persistence unavailable', error) }
  }

  async function loadArtworks() {
    try {
      const db = await openDatabase()
      state.artworks = await new Promise((resolve, reject) => {
        const request = db.transaction('artworks').objectStore('artworks').getAll()
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt))
        request.onerror = () => reject(request.error)
      })
      db.close()
    } catch (error) { state.artworks = [] }
  }

  async function importFile(file) {
    const processing = document.querySelector('#feltProcessing')
    processing.hidden = false
    try {
      const result = await global.BeadyBackgroundRemoval.removeBackground(file)
      const artwork = { ...result, id: uid('source'), createdAt: Date.now() }
      state.artworks.unshift(artwork)
      await saveArtwork(artwork)
      addArtwork(artwork)
      if (global.showToast) global.showToast('已去除背景并添加到毛毡板')
    } catch (error) {
      console.error(error)
      if (global.showToast) global.showToast(error.message || '图片处理失败')
    } finally {
      processing.hidden = true
      fileInput.value = ''
    }
  }

  function renderGallery() {
    galleryGrid.innerHTML = state.artworks.length
      ? state.artworks.map(item => `<button class="felt-gallery-item" type="button" data-source-id="${item.id}" aria-label="添加 ${item.name || '拼豆作品'}"><img src="${item.dataUrl}" alt=""></button>`).join('')
      : '<div class="felt-gallery-empty">还没有作品，上传一张现实拼豆照片试试吧 ✨</div>'
  }

  function openGallery() { renderGallery(); gallery.hidden = false; galleryBackdrop.hidden = false }
  function closeGallery() { gallery.hidden = true; galleryBackdrop.hidden = true }

  function show() {
    document.querySelector('#homeView').hidden = true
    document.querySelector('#libraryView').hidden = true
    document.querySelector('#resultView').hidden = true
    viewElement.hidden = false
    document.querySelector('.app-shell').classList.add('felt-active')
    requestAnimationFrame(() => {
      if (!state.initialized) {
        state.view.x = canvas.clientWidth / 2
        state.view.y = canvas.clientHeight / 2
        state.initialized = true
      }
      updateWorldTransform()
      renderObjects()
    })
  }

  function hide() {
    viewElement.hidden = true
    document.querySelector('.app-shell').classList.remove('felt-active')
    closeGallery()
  }

  canvas.addEventListener('pointerdown', startCanvasGesture)
  canvas.addEventListener('pointermove', moveCanvasGesture)
  canvas.addEventListener('pointerup', endCanvasGesture)
  canvas.addEventListener('pointercancel', endCanvasGesture)
  world.addEventListener('pointermove', moveArtGesture)
  world.addEventListener('pointerup', endArtGesture)
  world.addEventListener('pointercancel', endArtGesture)
  canvas.addEventListener('wheel', event => {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const worldX = (x - state.view.x) / state.view.scale
    const worldY = (y - state.view.y) / state.view.scale
    const next = Math.max(.15, Math.min(4, state.view.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
    state.view.scale = next
    state.view.x = x - worldX * next
    state.view.y = y - worldY * next
    updateWorldTransform()
  }, { passive: false })
  document.querySelector('#feltAdd').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) importFile(fileInput.files[0]) })
  document.querySelector('#feltMine').addEventListener('click', openGallery)
  document.querySelector('#feltGalleryClose').addEventListener('click', closeGallery)
  galleryBackdrop.addEventListener('click', closeGallery)
  galleryGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-source-id]')
    if (!button) return
    const artwork = state.artworks.find(item => item.id === button.dataset.sourceId)
    if (artwork) { closeGallery(); addArtwork(artwork) }
  })
  document.querySelector('#feltUndo').addEventListener('click', () => restoreHistory(state.historyIndex - 1))
  document.querySelector('#feltRedo').addEventListener('click', () => restoreHistory(state.historyIndex + 1))
  document.querySelector('#feltFit').addEventListener('click', fitToScreen)
  document.querySelector('#feltBrand').addEventListener('click', () => {
    hide(); document.querySelector('#homeView').hidden = false
  })
  document.querySelector('[data-felt-nav="home"]').addEventListener('click', () => {
    hide(); document.querySelector('#homeView').hidden = false
  })
  document.querySelector('[data-felt-nav="library"]').addEventListener('click', () => {
    hide(); if (global.showLibraryView) global.showLibraryView()
  })
  window.addEventListener('resize', () => { if (!viewElement.hidden) updateWorldTransform() })
  loadArtworks()

  global.BeadyFeltBoard = { show, hide, fitToScreen, state }
})(window)
