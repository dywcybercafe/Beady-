(function () {
const PaletteQuantizer = typeof window !== 'undefined' ? window.BeadyPaletteQuantizer : require('./paletteQuantizer')

function optimizeLabels(initialCodes, samples, width, height, selectedPalette, edgeMap, options = {}) {
  const codes = initialCodes.slice()
  const paletteByCode = selectedPalette.reduce((result, color) => { result[color.code] = color; return result }, {})
  const maxIterations = options.maxIterations || 4
  const lambda = options.lambda || 2.55
  const unaryCache = new Map()
  let changes = 0; let iterations = 0

  function neighbors(index) {
    const x = index % width; const y = Math.floor(index / width); const result = []
    if (x > 0) result.push(index - 1); if (x + 1 < width) result.push(index + 1)
    if (y > 0) result.push(index - width); if (y + 1 < height) result.push(index + width)
    return result
  }
  function unary(index, code) {
    const key = `${index}:${code}`
    if (!unaryCache.has(key)) unaryCache.set(key, PaletteQuantizer.perceptualDistance(samples[index].lab, paletteByCode[code].lab))
    return unaryCache.get(key)
  }
  function energy(index, candidate, adjacent) {
    let value = unary(index, candidate) * (1 + edgeMap.localContrast[index] * 1.85)
    for (const other of adjacent) if (candidate !== codes[other]) value += lambda * edgeMap.connectionWeight(index, other)
    return value
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = 0
    for (let step = 0; step < codes.length; step += 1) {
      const index = iteration % 2 ? codes.length - 1 - step : step
      const adjacent = neighbors(index)
      const candidates = new Set([codes[index]])
      for (const other of adjacent) candidates.add(codes[other])
      let best = codes[index]; let bestEnergy = energy(index, best, adjacent)
      for (const candidate of candidates) {
        const candidateEnergy = energy(index, candidate, adjacent)
        if (candidateEnergy + 0.12 < bestEnergy) { best = candidate; bestEnergy = candidateEnergy }
      }
      if (best !== codes[index]) { codes[index] = best; changed += 1 }
    }
    changes += changed; iterations = iteration + 1
    if (!changed || changed / codes.length < 0.0015) break
  }
  return { codes, changes, iterations }
}

const api = { optimizeLabels }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyLabelOptimizer = api
})()
