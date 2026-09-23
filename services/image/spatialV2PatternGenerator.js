(function () {
const Quantizer = typeof window !== 'undefined' ? window.BeadyQuantizer : require('./quantizer')
const Matcher = typeof window !== 'undefined' ? window.BeadyColorMatcher : require('./colorMatcher')
const BackgroundProcessor = typeof window !== 'undefined' ? window.BeadyBackgroundProcessor : require('./backgroundProcessor')
const FragmentOptimizer = typeof window !== 'undefined' ? window.BeadyFragmentOptimizer : require('./fragmentOptimizer')
const EdgeDetector = typeof window !== 'undefined' ? window.BeadyEdgeDetector : require('./edgeDetector')
const SpatialRefiner = typeof window !== 'undefined' ? window.BeadySpatialRefiner : require('./spatialRefiner')
const RegionCleaner = typeof window !== 'undefined' ? window.BeadyRegionCleaner : require('./regionCleaner')

async function generatePatternSpatialV2(options) {
  const { samples, width, height, colorLimit, backgroundMode = 'keep', palette, yieldControl = () => Promise.resolve() } = options
  const background = BackgroundProcessor.processBackground(samples, backgroundMode)
  const candidates = Quantizer.extractCandidateColors(background.samples, colorLimit)
  const selectedPalette = Matcher.mapCandidatesToPalette(candidates, palette)
  const fallbackPalette = selectedPalette.length ? selectedPalette : [palette[0]]
  const flatCodes = background.samples.map(sample => Matcher.matchLabToSelectedPalette(sample.lab, fallbackPalette).code)
  const paletteByCode = palette.reduce((result, color) => { result[color.code] = color; return result }, {})
  const legacyCodes = FragmentOptimizer.optimizeFragments(flatCodes, background.samples, width, height, paletteByCode)
  const edgeMap = EdgeDetector.analyzeEdges(background.samples, width, height)
  const spatial = SpatialRefiner.refineSpatially(legacyCodes, background.samples, width, height, fallbackPalette, edgeMap)
  const cleanup = RegionCleaner.cleanSimilarRegions(spatial.codes, background.samples, width, height, paletteByCode, edgeMap)
  await yieldControl()
  const counts = new Map(); const cells = []
  for (let y = 0; y < height; y += 1) {
    const row = cleanup.codes.slice(y * width, (y + 1) * width); cells.push(row)
    for (const code of row) counts.set(code, (counts.get(code) || 0) + 1)
  }
  return {
    width, height, cells,
    colors: Array.from(counts.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    colorLimit: Math.max(1, Math.min(64, Math.floor(colorLimit))), backgroundMode,
    metadata: { algorithm: 'edge-aware-spatial-v2', palette: 'MARD 221', sampling: 'area-linear-rgb-detail-aware', quantization: 'weighted-lab-kmeans', colorDifference: 'CIEDE2000', dithering: false, spatialRefinement: { iterations: spatial.iterations, changes: spatial.changes, regionCleanupChanges: cleanup.changes }, subjectRemovalApplied: background.subjectRemovalApplied }
  }
}

const api = { generatePatternSpatialV2 }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadySpatialV2PatternGenerator = api
})()
