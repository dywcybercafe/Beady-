(function () {
const Quantizer = typeof window !== 'undefined' ? window.BeadyQuantizer : require('./quantizer')
const Matcher = typeof window !== 'undefined' ? window.BeadyColorMatcher : require('./colorMatcher')
const BackgroundProcessor = typeof window !== 'undefined' ? window.BeadyBackgroundProcessor : require('./backgroundProcessor')
const FragmentOptimizer = typeof window !== 'undefined' ? window.BeadyFragmentOptimizer : require('./fragmentOptimizer')

async function generatePatternLegacy(options) {
  const { samples, width, height, colorLimit, backgroundMode = 'keep', palette, onProgress = () => {}, yieldControl = () => Promise.resolve() } = options
  const background = BackgroundProcessor.processBackground(samples, backgroundMode)
  const candidates = Quantizer.extractCandidateColors(background.samples, colorLimit)
  const selectedPalette = Matcher.mapCandidatesToPalette(candidates, palette)
  const fallbackPalette = selectedPalette.length ? selectedPalette : [palette[0]]
  const flatCodes = background.samples.map(sample => Matcher.matchLabToSelectedPalette(sample.lab, fallbackPalette).code)
  const paletteByCode = palette.reduce((result, color) => { result[color.code] = color; return result }, {})
  const optimizedCodes = FragmentOptimizer.optimizeFragments(flatCodes, background.samples, width, height, paletteByCode)
  const counts = new Map()
  const cells = []
  for (let y = 0; y < height; y += 1) {
    const row = optimizedCodes.slice(y * width, (y + 1) * width)
    cells.push(row)
    for (const code of row) counts.set(code, (counts.get(code) || 0) + 1)
  }
  return {
    width, height, cells,
    colors: Array.from(counts.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    colorLimit: Math.max(1, Math.min(64, Math.floor(colorLimit))),
    backgroundMode,
    metadata: { algorithm: 'legacy', palette: 'MARD 221', sampling: 'area-linear-rgb-detail-aware', quantization: 'weighted-lab-kmeans', colorDifference: 'CIEDE2000', dithering: false, subjectRemovalApplied: background.subjectRemovalApplied }
  }
}

const api = { generatePatternLegacy }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyLegacyPatternGenerator = api
})()
