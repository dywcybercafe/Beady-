const STORAGE_KEY = 'beady-pattern-library-v1'
function buildPatternItem(pattern, source) {
  return {
    id: `pattern-${Date.now()}`,
    kind: 'pattern',
    title: `${pattern.width} × ${pattern.height}`,
    width: source.width,
    height: source.height,
    createdAt: Date.now(),
    imagePath: source.imagePath,
    ownsImageFile: Boolean(source.ownsImageFile),
    pattern,
    favorite: false
  }
}

function loadSavedPatterns() {
  try {
    const items = wx.getStorageSync(STORAGE_KEY) || []
    const cleaned = items.filter(item => !item.isDemo && !(item.pattern && item.pattern.metadata && item.pattern.metadata.demo))
    if (cleaned.length !== items.length) wx.setStorageSync(STORAGE_KEY, cleaned)
    return cleaned
  } catch (error) { return [] }
}

function savePattern(pattern, source) {
  const existing = loadSavedPatterns()
  const item = buildPatternItem(pattern, source)
  wx.setStorageSync(STORAGE_KEY, [...existing, item])
  return item
}

function saveImportedImage({ path, width, height, title }) {
  const existing = loadSavedPatterns()
  const item = {
    id: `image-${Date.now()}`,
    kind: 'image',
    title: title || `${width} × ${height}`,
    width,
    height,
    createdAt: Date.now(),
    imagePath: path,
    ownsImageFile: true,
    favorite: false
  }
  wx.setStorageSync(STORAGE_KEY, [...existing, item])
  return item
}

function updateItem(id, updates) {
  const items = loadSavedPatterns()
  const next = items.map(item => item.id === id ? { ...item, ...updates } : item)
  wx.setStorageSync(STORAGE_KEY, next)
  return next.find(item => item.id === id)
}

function deleteItem(id) {
  const next = loadSavedPatterns().filter(item => item.id !== id)
  wx.setStorageSync(STORAGE_KEY, next)
  return next
}

const api = { STORAGE_KEY, loadSavedPatterns, savePattern, saveImportedImage, updateItem, deleteItem }
if (typeof module !== 'undefined' && module.exports) module.exports = api
