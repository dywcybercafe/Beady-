const fileInput = document.querySelector('#fileInput')
const uploadEmpty = document.querySelector('#uploadEmpty')
const uploadPreview = document.querySelector('#uploadPreview')
const previewImage = document.querySelector('#previewImage')
const customPanel = document.querySelector('#customSizePanel')
const customContent = document.querySelector('#customSizeContent')
const customTrigger = document.querySelector('#customSizeTrigger')
const customWidth = document.querySelector('#customWidth')
const customHeight = document.querySelector('#customHeight')
const lockButton = document.querySelector('#lockRatio')
const customColor = document.querySelector('#customColor')
const customColorValue = document.querySelector('#customColorValue')
const customColorChevron = document.querySelector('#customColorChevron')
let imageRatio = 1
let uploadedImageDataUrl = ''
let uploadedImageWidth = 1
let uploadedImageHeight = 1
let ratioLocked = true
let toastTimer
let currentPattern = null
let selectedPatternCode = ''
let canvasState = null
let resultOrigin = 'home'
let libraryItems = []
let selectedLibraryItem = null
const LIBRARY_STORAGE_KEY = 'beady-pattern-library-v1'
const paletteByCode = window.MARD221.reduce((result, color) => {
  result[color.code] = color
  return result
}, {})

function showToast(message) {
  const toast = document.querySelector('#toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800)
}

document.querySelectorAll('.option-group').forEach(group => {
  group.addEventListener('click', event => {
    const button = event.target.closest('button[data-value]')
    if (!button) return
    group.querySelectorAll('button').forEach(item => item.classList.remove('selected'))
    button.classList.add('selected')
    if (group.dataset.group === 'size') {
      customPanel.classList.remove('open')
      customContent.hidden = true
      customTrigger.querySelector('.chevron').textContent = '›'
    }
    if (group.dataset.group === 'color') {
      customColor.classList.remove('selected')
      customColorValue.hidden = true
      customColorChevron.hidden = false
    }
  })
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    uploadedImageDataUrl = reader.result
    previewImage.onload = () => {
      uploadedImageWidth = previewImage.naturalWidth
      uploadedImageHeight = previewImage.naturalHeight
      imageRatio = uploadedImageWidth / uploadedImageHeight
    }
    previewImage.src = uploadedImageDataUrl
    uploadEmpty.hidden = true
    uploadPreview.hidden = false
  }
  reader.onerror = () => showToast('无法读取图片')
  reader.readAsDataURL(file)
})

document.querySelector('#removeImage').addEventListener('click', event => {
  event.preventDefault()
  event.stopPropagation()
  fileInput.value = ''
  uploadedImageDataUrl = ''
  uploadedImageWidth = 1
  uploadedImageHeight = 1
  previewImage.removeAttribute('src')
  uploadPreview.hidden = true
  uploadEmpty.hidden = false
})

document.querySelector('.replace-image').addEventListener('click', event => {
  event.preventDefault()
  fileInput.click()
})

customTrigger.addEventListener('click', () => {
  document.querySelectorAll('[data-group="size"] button').forEach(item => item.classList.remove('selected'))
  customPanel.classList.add('open')
  customContent.hidden = false
  customTrigger.querySelector('.chevron').textContent = '⌃'
})

customWidth.addEventListener('input', () => {
  if (ratioLocked && Number(customWidth.value)) customHeight.value = Math.max(1, Math.round(Number(customWidth.value) / imageRatio))
})
customHeight.addEventListener('input', () => {
  if (ratioLocked && Number(customHeight.value)) customWidth.value = Math.max(1, Math.round(Number(customHeight.value) * imageRatio))
})
lockButton.addEventListener('click', () => {
  ratioLocked = !ratioLocked
  lockButton.querySelector('.switch').classList.toggle('on', ratioLocked)
})

customColor.addEventListener('click', event => {
  if (event.target.closest('input')) return
  document.querySelectorAll('[data-group="color"] button').forEach(item => item.classList.remove('selected'))
  customColor.classList.add('selected')
  customColorValue.hidden = false
  customColorChevron.hidden = true
})
customColorValue.querySelector('input').addEventListener('input', event => {
  if (Number(event.target.value) > 64) event.target.value = 64
})

document.querySelector('#generateButton').addEventListener('click', generateWebPattern)
document.querySelectorAll('[data-placeholder]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.placeholder)))

function readTargetSize() {
  const selected = document.querySelector('[data-group="size"] button.selected')
  if (selected) {
    const [width, height] = selected.dataset.value.split('x').map(Number)
    return { width, height }
  }
  return {
    width: Math.max(1, Math.floor(Number(customWidth.value) || 1)),
    height: Math.max(1, Math.floor(Number(customHeight.value) || 1))
  }
}

function readColorLimit() {
  const selected = document.querySelector('[data-group="color"] button.selected')
  if (selected) return Number(selected.dataset.value)
  return Math.max(1, Math.min(64, Number(customColorValue.querySelector('input').value) || 24))
}

async function generateWebPattern() {
  if (!previewImage.src) {
    showToast('请先上传一张图片')
    return
  }

  const generateButton = document.querySelector('#generateButton')
  const originalText = generateButton.innerHTML
  generateButton.disabled = true
  generateButton.textContent = '正在生成…'

  try {
    const { width, height } = readTargetSize()
    const oversample = 4
    const processor = document.createElement('canvas')
    processor.width = width * oversample
    processor.height = height * oversample
    const context = processor.getContext('2d', { willReadFrequently: true })
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, processor.width, processor.height)
    context.drawImage(previewImage, 0, 0, processor.width, processor.height)
    const imageData = context.getImageData(0, 0, processor.width, processor.height)
    const samples = window.BeadySampler.sampleImageData(imageData, processor.width, processor.height, width, height)
    const backgroundButton = document.querySelector('[data-group="background"] button.selected')

    currentPattern = await window.BeadyPatternGenerator.generatePattern({
      samples,
      width,
      height,
      colorLimit: readColorLimit(),
      backgroundMode: backgroundButton ? backgroundButton.dataset.value : 'keep',
      palette: window.MARD221,
      yieldControl: () => new Promise(resolve => setTimeout(resolve, 0))
    })
    currentPattern.sourceImage = uploadedImageDataUrl || previewImage.src
    currentPattern.sourceWidth = uploadedImageWidth || previewImage.naturalWidth
    currentPattern.sourceHeight = uploadedImageHeight || previewImage.naturalHeight
    showResultView()
  } catch (error) {
    console.error(error)
    showToast(new URLSearchParams(window.location.search).get('demo') === '1' ? error.message : '生成失败，请换张图片重试')
  } finally {
    generateButton.disabled = false
    generateButton.innerHTML = originalText
  }
}

function showResultView(origin = 'home') {
  resultOrigin = origin
  if (window.BeadyFeltBoard) window.BeadyFeltBoard.hide()
  document.querySelector('#homeView').hidden = true
  document.querySelector('#libraryView').hidden = true
  document.querySelector('#resultView').hidden = false
  document.querySelector('#resultDimensions').textContent = `${currentPattern.width} × ${currentPattern.height}`
  document.querySelector('#colorSummary').textContent = `共 ${currentPattern.colors.length} 种颜色 · ${currentPattern.width * currentPattern.height} 颗`
  currentPattern._colorByCode=Object.fromEntries(currentPattern.colors.map(item=>[item.code,item]))
  selectedPatternCode = ''
  renderColorList()
  if(currentPattern.type==='external'){
    const sourceImage=new Image()
    currentPattern._sourceImage=sourceImage
    sourceImage.onload=()=>requestAnimationFrame(setupResultCanvas)
    sourceImage.onerror=()=>showToast('无法读取原始图纸')
    sourceImage.src=currentPattern.sourceImage
  }else requestAnimationFrame(setupResultCanvas)
}

function getPatternColor(code) {
  return currentPattern.type==='external'?currentPattern._colorByCode[code]:paletteByCode[code]
}

function renderColorList() {
  const largest = currentPattern.colors[0] ? currentPattern.colors[0].count : 1
  const list = document.querySelector('#resultColorList')
  list.innerHTML = currentPattern.colors.map(item => {
    const color = getPatternColor(item.code)
    const percent = Math.max(8, Math.round(item.count / largest * 100))
    return `<div class="web-color-item ${selectedPatternCode === item.code ? 'selected' : ''}" data-code="${item.code}">
      <i class="web-swatch" style="background:${color.hex}"></i>
      <strong class="web-code">${item.code}</strong>
      <span class="web-amount"><i style="width:${percent}%;background:${color.hex}"></i></span>
      <span class="web-count">${item.count} 颗</span>
    </div>`
  }).join('')
}

function setupResultCanvas() {
  const canvas = document.querySelector('#resultCanvas')
  const rect = canvas.getBoundingClientRect()
  const pixelRatio = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * pixelRatio)
  canvas.height = Math.round(rect.height * pixelRatio)
  const patternWidth = currentPattern.width * 14
  const patternHeight = currentPattern.height * 14
  const region=currentPattern.type==='external'?(currentPattern.sourceRegion||{x:0,y:0,width:1,height:1}):{x:0,y:0,width:1,height:1}
  const worldBounds=currentPattern.type==='external'?{x:-region.x/region.width*patternWidth,y:-region.y/region.height*patternHeight,width:patternWidth/region.width,height:patternHeight/region.height}:{x:0,y:0,width:patternWidth,height:patternHeight}
  const fitScale = Math.min((rect.width - 24) / worldBounds.width, (rect.height - 24) / worldBounds.height)
  const initialScale=Math.max(0.12,fitScale)
  canvasState = {
    canvas,
    context: canvas.getContext('2d'),
    width: rect.width,
    height: rect.height,
    pixelRatio,
    fitScale,
    scale: initialScale,
    offsetX: (rect.width - worldBounds.width * initialScale) / 2 - worldBounds.x * initialScale,
    offsetY: (rect.height - worldBounds.height * initialScale) / 2 - worldBounds.y * initialScale,
    worldBounds,
    pointers: new Map(),
    moved: false
  }
  bindCanvasInteractions(canvas)
  updateWebZoomLabel()
  drawWebPattern()
}

function drawWebPattern() {
  if (!canvasState || !currentPattern) return
  const { context, pixelRatio, width, height, scale, offsetX, offsetY } = canvasState
  const cellSize = 14
  const screenCell = cellSize * scale
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#F4F4F8'
  context.fillRect(0, 0, width, height)
  context.save()
  context.translate(offsetX, offsetY)
  context.scale(scale, scale)

  if(currentPattern.type==='external'&&currentPattern._sourceImage){
    const source=currentPattern._sourceImage,bounds=canvasState.worldBounds
    context.globalAlpha=1
    context.drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height)
    for(let y=0;y<currentPattern.height;y+=1){for(let x=0;x<currentPattern.width;x+=1){const code=currentPattern.cells[y][x],selected=selectedPatternCode&&code===selectedPatternCode,dimmed=selectedPatternCode&&code!==selectedPatternCode;if(dimmed){context.fillStyle='rgba(247,247,251,.78)';context.fillRect(x*cellSize,y*cellSize,cellSize,cellSize)}if(selected){context.strokeStyle='#2D214F';context.lineWidth=1.5/scale;context.strokeRect(x*cellSize,y*cellSize,cellSize,cellSize)}else if(screenCell>=8){context.strokeStyle='rgba(52,52,65,.1)';context.lineWidth=.4/scale;context.strokeRect(x*cellSize,y*cellSize,cellSize,cellSize)}}}
    context.strokeStyle='#292933';context.lineWidth=1.2/scale;context.strokeRect(0,0,currentPattern.width*cellSize,currentPattern.height*cellSize);context.restore();return
  }

  for (let y = 0; y < currentPattern.height; y += 1) {
    for (let x = 0; x < currentPattern.width; x += 1) {
      const code = currentPattern.cells[y][x]
      const color = getPatternColor(code)
      const dimmed = selectedPatternCode && code !== selectedPatternCode
      context.globalAlpha = dimmed ? 0.14 : 1
      context.fillStyle = color.hex
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
      if (screenCell >= 5) {
        context.strokeStyle = selectedPatternCode && code === selectedPatternCode ? '#2D214F' : 'rgba(52,52,65,.16)'
        context.lineWidth = selectedPatternCode && code === selectedPatternCode ? 1.4 / scale : 0.5 / scale
        context.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize)
      }
      if (screenCell >= 20 && !dimmed) {
        context.fillStyle = window.BeadyColorSpace.relativeLuminance(color.rgb) > 0.48 ? '#23232C' : '#FFFFFF'
        context.font = `600 ${cellSize * 0.39}px sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(code, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2)
      }
    }
  }
  context.globalAlpha = 1
  context.strokeStyle = '#292933'
  context.lineWidth = 1.2 / scale
  context.strokeRect(0, 0, currentPattern.width * cellSize, currentPattern.height * cellSize)
  context.restore()
}

function zoomWebAt(nextScale, centerX, centerY) {
  if (!canvasState) return
  nextScale = Math.max(canvasState.fitScale * 0.75, Math.min(3.6, nextScale))
  const worldX = (centerX - canvasState.offsetX) / canvasState.scale
  const worldY = (centerY - canvasState.offsetY) / canvasState.scale
  canvasState.scale = nextScale
  canvasState.offsetX = centerX - worldX * nextScale
  canvasState.offsetY = centerY - worldY * nextScale
  updateWebZoomLabel()
  drawWebPattern()
}

function updateWebZoomLabel() {
  document.querySelector('#zoomLabel').textContent = `${Math.round(canvasState.scale / canvasState.fitScale * 100)}%`
}

function bindCanvasInteractions(canvas) {
  canvas.onwheel = event => {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14
    zoomWebAt(canvasState.scale * factor, event.clientX - rect.left, event.clientY - rect.top)
  }
  canvas.onpointerdown = event => {
    canvas.setPointerCapture(event.pointerId)
    canvasState.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY })
    canvasState.moved = false
    canvasState.tapStart = { x: event.offsetX, y: event.offsetY }
    canvasState.lastPoint = { x: event.offsetX, y: event.offsetY }
    if (canvasState.pointers.size === 2) startWebPinch()
  }
  canvas.onpointermove = event => {
    if (!canvasState.pointers.has(event.pointerId)) return
    canvasState.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY })
    if (canvasState.pointers.size === 1) {
      const dx = event.offsetX - canvasState.lastPoint.x
      const dy = event.offsetY - canvasState.lastPoint.y
      if (Math.abs(dx) + Math.abs(dy) > 1) canvasState.moved = true
      canvasState.offsetX += dx
      canvasState.offsetY += dy
      canvasState.lastPoint = { x: event.offsetX, y: event.offsetY }
      drawWebPattern()
    } else if (canvasState.pointers.size === 2 && canvasState.pinchStart) {
      const pinch = getWebPinch()
      zoomWebAt(canvasState.pinchScale * pinch.distance / canvasState.pinchStart.distance, pinch.x, pinch.y)
      canvasState.moved = true
    }
  }
  canvas.onpointerup = canvas.onpointercancel = event => {
    const wasSingle = canvasState.pointers.size === 1
    if (wasSingle && !canvasState.moved && canvasState.tapStart) selectCanvasCell(canvasState.tapStart.x, canvasState.tapStart.y)
    canvasState.pointers.delete(event.pointerId)
    canvasState.pinchStart = null
    canvasState.tapStart = null
  }
}

function getWebPinch() {
  const points = Array.from(canvasState.pointers.values())
  const dx = points[1].x - points[0].x
  const dy = points[1].y - points[0].y
  return { distance: Math.max(1, Math.hypot(dx, dy)), x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
}

function startWebPinch() {
  canvasState.pinchStart = getWebPinch()
  canvasState.pinchScale = canvasState.scale
}

function selectCanvasCell(screenX, screenY) {
  const x = Math.floor((screenX - canvasState.offsetX) / (14 * canvasState.scale))
  const y = Math.floor((screenY - canvasState.offsetY) / (14 * canvasState.scale))
  if (x >= 0 && x < currentPattern.width && y >= 0 && y < currentPattern.height) togglePatternColor(currentPattern.cells[y][x])
}

function togglePatternColor(code) {
  selectedPatternCode = selectedPatternCode === code ? '' : code
  document.querySelector('#selectionTip').hidden = !selectedPatternCode
  document.querySelector('#selectionText').textContent = selectedPatternCode ? `正在高亮 ${selectedPatternCode}` : ''
  renderColorList()
  drawWebPattern()
}

document.querySelector('#resultColorList').addEventListener('click', event => {
  const item = event.target.closest('[data-code]')
  if (item) togglePatternColor(item.dataset.code)
})
document.querySelector('#clearSelection').addEventListener('click', () => togglePatternColor(selectedPatternCode))
document.querySelector('#backToHome').addEventListener('click', () => {
  document.querySelector('#resultView').hidden = true
  if (resultOrigin === 'library') showLibraryView()
  else document.querySelector('#homeView').hidden = false
})
document.querySelector('#zoomIn').addEventListener('click', () => zoomWebAt(canvasState.scale * 1.35, canvasState.width / 2, canvasState.height / 2))
document.querySelector('#zoomOut').addEventListener('click', () => zoomWebAt(canvasState.scale / 1.35, canvasState.width / 2, canvasState.height / 2))

function readLibraryStorage(key,fallback=[]) {
  try { return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback)) } catch(error) { return fallback }
}

function prepareWebLibraryItem(item,libraryIndex) {
  const imageSrc=item.imageSrc||(item.pattern&&item.pattern.sourceImage)||''
  const width=Math.max(1,Number(item.width)||(item.pattern&&item.pattern.sourceWidth)||1),height=Math.max(1,Number(item.height)||(item.pattern&&item.pattern.sourceHeight)||1)
  const scale=Math.min(150/width,99/height)
  return {...item,imageSrc,width,height,displayWidth:Math.max(1,Math.round(width*scale)),displayHeight:Math.max(1,Math.round(height*scale)),shelfIndex:Math.floor(libraryIndex/4)%4}
}

function loadWebLibrary() {
  const stored=readLibraryStorage(LIBRARY_STORAGE_KEY)
  const nonDemo=stored.filter(item=>!item.isDemo&&!(item.pattern&&item.pattern.metadata&&item.pattern.metadata.demo))
  if(nonDemo.length!==stored.length)localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(nonDemo))
  const saved=nonDemo.filter(item=>item.imageSrc||(item.pattern&&item.pattern.sourceImage)).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))
  libraryItems=saved.map(prepareWebLibraryItem)
}

function renderLibrary(filter='') {
  const configs=[['pink','pink','left'],['blue','blue','right'],['green','green','left'],['yellow','yellow','right']]
  const normalized=filter.trim().toLowerCase()
  const items=normalized?libraryItems.filter(item=>`${item.title} ${item.width}x${item.height}`.toLowerCase().includes(normalized)):libraryItems
  document.querySelector('#libraryShelves').innerHTML=configs.map(([theme,cloud,side],shelfIndex)=>{
    const shelfItems=items.filter(item=>item.shelfIndex===shelfIndex).sort((a,b)=>Number(b.favorite)-Number(a.favorite))
    const cards=shelfItems.map(item=>`<button class="library-pattern" type="button" data-library-id="${item.id}" style="width:${item.displayWidth}px;height:${item.displayHeight}px"><img class="library-uploaded-pattern" src="${item.imageSrc}" alt="">${item.favorite?'<i class="library-favorite">♥</i>':''}</button>`).join('')
    return `<section class="acrylic-shelf ${theme}"><div class="shelf-arrows"><button type="button" data-shift="-1">‹</button><button type="button" data-shift="1">›</button></div><div class="acrylic-back"></div><div class="shelf-carousel"><div class="shelf-track">${cards}<i style="width:45px;flex:none"></i></div></div><div class="acrylic-front-rail"></div><img class="shelf-cloud ${side}" src="../assets/images/library/cloud-${cloud}.png?v=4" alt=""><i class="shelf-edge-highlight"></i><i class="web-screw left"></i><i class="web-screw right"></i></section>`
  }).join('')
  bindLibraryInteractions()
}

function bindLibraryInteractions() {
  document.querySelectorAll('.acrylic-shelf').forEach(shelf=>{
    const carousel=shelf.querySelector('.shelf-carousel')
    shelf.querySelectorAll('[data-shift]').forEach(button=>button.addEventListener('click',()=>carousel.scrollBy({left:Number(button.dataset.shift)*205,behavior:'smooth'})))
    let dragging=false,startX=0,startScroll=0
    carousel.addEventListener('pointerdown',event=>{dragging=true;carousel._dragMoved=false;startX=event.clientX;startScroll=carousel.scrollLeft})
    carousel.addEventListener('pointermove',event=>{if(!dragging)return;if(Math.abs(event.clientX-startX)>4&&!carousel._dragMoved){carousel._dragMoved=true;carousel.classList.add('dragging');carousel.setPointerCapture(event.pointerId)}carousel.scrollLeft=startScroll-(event.clientX-startX)})
    carousel.addEventListener('pointerup',event=>{dragging=false;carousel.classList.remove('dragging');if(carousel.hasPointerCapture(event.pointerId))carousel.releasePointerCapture(event.pointerId);if(carousel._dragMoved){carousel.dataset.dragged='1';setTimeout(()=>delete carousel.dataset.dragged,0)}})
    carousel.addEventListener('pointercancel',()=>{dragging=false;carousel.classList.remove('dragging')})
  })
  document.querySelectorAll('[data-library-id]').forEach(card=>card.addEventListener('click',()=>{if(card.closest('.shelf-carousel').dataset.dragged)return;const item=libraryItems.find(entry=>entry.id===card.dataset.libraryId);if(item)showPatternActions(item)}))
}

function showLibraryView() {
  if (window.BeadyFeltBoard) window.BeadyFeltBoard.hide()
  document.querySelector('#homeView').hidden=true
  document.querySelector('#resultView').hidden=true
  document.querySelector('#libraryView').hidden=false
  loadWebLibrary();renderLibrary(document.querySelector('#librarySearchInput').value)
}

function saveCurrentToWebLibrary() {
  if(!currentPattern||!currentPattern.sourceImage){showToast('暂无可保存的原始图片');return}
  const saved=readLibraryStorage(LIBRARY_STORAGE_KEY)
  const storedPattern={...currentPattern}
  delete storedPattern._sourceImage
  delete storedPattern._colorByCode
  saved.push({id:`pattern-${Date.now()}`,kind:'pattern',title:`${currentPattern.width} × ${currentPattern.height}`,width:currentPattern.sourceWidth||currentPattern.width,height:currentPattern.sourceHeight||currentPattern.height,createdAt:Date.now(),imageSrc:currentPattern.sourceImage,pattern:storedPattern,favorite:false})
  try{localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(saved));showToast('已保存到图纸库');showLibraryView()}catch(error){showToast('原始图片过大，浏览器无法本地保存')}
}

function showPatternActions(item) {
  selectedLibraryItem=item
  document.querySelector('#favoritePatternAction').textContent=item.favorite?'取消喜爱':'标记喜爱'
  document.querySelector('#patternActionSheet').hidden=false
}

function updateSelectedPattern(action) {
  const item=selectedLibraryItem
  if(!item)return
  const saved=readLibraryStorage(LIBRARY_STORAGE_KEY)
  const next=action==='delete'?saved.filter(entry=>entry.id!==item.id):saved.map(entry=>entry.id===item.id?{...entry,favorite:!item.favorite}:entry)
  localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(next))
  document.querySelector('#patternActionSheet').hidden=true
  selectedLibraryItem=null
  if(action==='delete')showToast('已删除')
  showLibraryView()
}

function importWebPattern(file) {
  if(!file)return
  const reader=new FileReader()
  reader.onload=()=>{const image=new Image();image.onload=()=>{const saved=readLibraryStorage(LIBRARY_STORAGE_KEY);saved.push({id:`image-${Date.now()}`,kind:'image',title:file.name||'上传图纸',width:image.naturalWidth,height:image.naturalHeight,createdAt:Date.now(),imageSrc:reader.result,favorite:false});try{localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(saved));showToast('已添加到图纸库');showLibraryView()}catch(error){showToast('图片过大，浏览器无法本地保存')}};image.onerror=()=>showToast('无法读取图片');image.src=reader.result}
  reader.onerror=()=>showToast('无法读取图片')
  reader.readAsDataURL(file)
}

function openExternalWebWorkbench(item,analysis) {
  currentPattern={type:'external',width:analysis.width,height:analysis.height,cells:analysis.cells,colors:analysis.colors,sourceImage:item.imageSrc,sourceRegion:analysis.region,colorLimit:analysis.colors.length,backgroundMode:'original'}
  showResultView('library')
}

function putSelectedOnWorkbench() {
  const item=selectedLibraryItem
  document.querySelector('#patternActionSheet').hidden=true
  selectedLibraryItem=null
  if(!item)return
  if(item.pattern){currentPattern=item.pattern;showResultView('library');return}
  if(item.analysis){openExternalWebWorkbench(item,item.analysis);return}
  const image=new Image()
  showToast('正在识别豆子网格…')
  image.onload=()=>{const scale=Math.min(1,640/Math.max(image.naturalWidth,image.naturalHeight));const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,width,height);const imageData=context.getImageData(0,0,width,height);let analysis=window.BeadyGridRecognizer.recognize(imageData,width,height);if(!analysis.reliable){if(!window.confirm('自动识别置信度较低。是否确认整张上传图片都是需要识别的拼豆有效区域？'))return;if(analysis.width<3||analysis.height<3){showToast('未识别到规则网格');return}analysis={...window.BeadyGridRecognizer.recognize(imageData,width,height,{region:{x:0,y:0,width,height,columns:analysis.width,rows:analysis.height}}),confirmed:true}}const saved=readLibraryStorage(LIBRARY_STORAGE_KEY).map(entry=>entry.id===item.id?{...entry,analysis}:entry);localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify(saved));openExternalWebWorkbench(item,analysis)}
  image.onerror=()=>showToast('无法读取图纸图片')
  image.src=item.imageSrc
}

document.querySelector('[data-nav="library"]').addEventListener('click',showLibraryView)
document.querySelectorAll('[data-nav="felt"]').forEach(button=>button.addEventListener('click',()=>window.BeadyFeltBoard.show()))
document.querySelector('[data-library-nav="create"]').addEventListener('click',()=>{document.querySelector('#libraryView').hidden=true;document.querySelector('#homeView').hidden=false})
document.querySelector('#librarySearch').addEventListener('click',()=>{const panel=document.querySelector('#librarySearchPanel');panel.hidden=!panel.hidden;if(!panel.hidden)document.querySelector('#librarySearchInput').focus()})
document.querySelector('#librarySearchInput').addEventListener('input',event=>renderLibrary(event.target.value))
document.querySelector('#libraryNew').addEventListener('click',()=>{document.querySelector('#libraryAddSheet').hidden=false})
document.querySelectorAll('[data-library-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.libraryAction;document.querySelector('#libraryAddSheet').hidden=true;if(action==='save')saveCurrentToWebLibrary();if(action==='upload')document.querySelector('#libraryUploadInput').click()}))
document.querySelector('#libraryUploadInput').addEventListener('change',event=>{importWebPattern(event.target.files[0]);event.target.value=''})
document.querySelector('#workbenchPatternAction').addEventListener('click',putSelectedOnWorkbench)
document.querySelector('#favoritePatternAction').addEventListener('click',()=>updateSelectedPattern('favorite'))
document.querySelector('#deletePatternAction').addEventListener('click',()=>updateSelectedPattern('delete'))
document.querySelector('#cancelPatternAction').addEventListener('click',()=>{document.querySelector('#patternActionSheet').hidden=true;selectedLibraryItem=null})

// Local QA hook: exercises the exact upload-to-result path without adding UI.
const demoFixture = new URLSearchParams(window.location.search).get('demo')
const requestedPage = new URLSearchParams(window.location.search).get('page')
if (requestedPage === 'library') showLibraryView()
if (requestedPage === 'felt') window.BeadyFeltBoard.show()
if (demoFixture === '1' || demoFixture === 'cat') {
  previewImage.onload = () => {
    imageRatio = previewImage.naturalWidth / previewImage.naturalHeight
    uploadEmpty.hidden = true
    uploadPreview.hidden = false
    if (demoFixture === 'cat') {
      document.querySelectorAll('[data-group="size"] button').forEach(item => item.classList.remove('selected'))
      customWidth.value = 78
      customHeight.value = Math.round(78 / imageRatio)
    }
    generateWebPattern()
  }
  previewImage.src = demoFixture === 'cat' ? '../benchmark/assets/original.jpg' : '../assets/images/upload-cloud.png'
}
