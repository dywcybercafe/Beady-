(function () {
const BackgroundProcessor = typeof window !== 'undefined' ? window.BeadyBackgroundProcessor : require('./backgroundProcessor')
const PaletteQuantizer = typeof window !== 'undefined' ? window.BeadyPaletteQuantizer : require('./paletteQuantizer')
const EdgeDetector = typeof window !== 'undefined' ? window.BeadyEdgeDetector : require('./edgeDetector')
const LabelOptimizer = typeof window !== 'undefined' ? window.BeadyLabelOptimizer : require('./labelOptimizer')
const ArtifactCleaner = typeof window !== 'undefined' ? window.BeadyArtifactCleaner : require('./artifactCleaner')

function assemblePattern(codes, width, height, options, metadata) {
  const counts = new Map(); const cells = []
  for (let y = 0; y < height; y += 1) {
    const row = codes.slice(y * width, (y + 1) * width)
    cells.push(row)
    for (const code of row) counts.set(code, (counts.get(code) || 0) + 1)
  }
  return {
    width, height, cells,
    colors: Array.from(counts.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    colorLimit: Math.max(1, Math.min(64, Math.floor(options.colorLimit))),
    backgroundMode: options.backgroundMode || 'keep',
    metadata
  }
}

async function generatePattern(options) {
  const { samples, width, height, colorLimit, backgroundMode = 'keep', palette, onProgress = () => {}, yieldControl = () => Promise.resolve() } = options
  if (!Array.isArray(samples) || samples.length !== width * height) throw new Error('Sample count does not match the requested pattern dimensions')
  if (!Array.isArray(palette) || !palette.length) throw new Error('Palette is empty')

  onProgress(0.08, '处理背景')
  const background = BackgroundProcessor.processBackground(samples, backgroundMode)
  await yieldControl()

  onProgress(0.24, '选择实体色卡')
  const quantized = PaletteQuantizer.selectPalette(background.samples, palette, colorLimit)
  const selectedPalette = quantized.selectedPalette.length ? quantized.selectedPalette : [palette[0]]
  await yieldControl()

  onProgress(0.48, '匹配 MARD 色号')
  const initialCodes = PaletteQuantizer.assignSamples(background.samples, selectedPalette)
  const edgeMap = EdgeDetector.analyzeEdges(background.samples, width, height)
  await yieldControl()

  onProgress(0.74, '整理连续色块')
  const optimized = LabelOptimizer.optimizeLabels(initialCodes, background.samples, width, height, selectedPalette, edgeMap)
  await yieldControl()

  onProgress(0.9, '清理杂色')
  const paletteByCode = palette.reduce((result, color) => { result[color.code] = color; return result }, {})
  const cleaned = ArtifactCleaner.cleanArtifacts(optimized.codes, background.samples, width, height, paletteByCode, edgeMap)
  const usedCodes = new Set(cleaned.codes)
  if (usedCodes.size > Math.max(1, Math.floor(colorLimit))) throw new Error('Internal palette limit invariant failed')

  onProgress(1, '完成')
  return assemblePattern(cleaned.codes, width, height, { colorLimit, backgroundMode }, {
    algorithm: 'mard-constrained-clean-v3',
    palette: 'MARD 221',
    sampling: 'two-mode-edge-aware-medoid',
    quantization: 'direct-mard-constrained-weighted-medoids',
    colorDifference: 'CIEDE2000-neutral-guarded',
    dithering: false,
    selectedPaletteSize: selectedPalette.length,
    histogramPointCount: quantized.pointCount,
    spatialRefinement: { iterations: optimized.iterations, changes: optimized.changes, artifactCleanupChanges: cleaned.changes },
    subjectRemovalApplied: background.subjectRemovalApplied,
    generatedAt: new Date().toISOString()
  })
}

const api = { generatePattern }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyPatternGenerator = api
})()
