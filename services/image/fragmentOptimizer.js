(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function optimizeFragments(codes, samples, width, height, paletteByCode) {
  const optimized = codes.slice()
  const indexAt = (x, y) => y * width + x

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = indexAt(x, y)
      if (samples[index].edgeStrength >= 0.08) continue
      const neighbors = [
        codes[indexAt(x - 1, y)],
        codes[indexAt(x + 1, y)],
        codes[indexAt(x, y - 1)],
        codes[indexAt(x, y + 1)]
      ]
      if (!neighbors.every(code => code === neighbors[0]) || neighbors[0] === codes[index]) continue
      const current = paletteByCode[codes[index]]
      const surrounding = paletteByCode[neighbors[0]]
      if (!current || !surrounding) continue
      if (ColorSpace.deltaE2000(current.lab, surrounding.lab) <= 2.2) optimized[index] = neighbors[0]
    }
  }

  return optimized
}

const api = { optimizeFragments }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyFragmentOptimizer = api
})()
