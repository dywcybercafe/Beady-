(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function refineSpatially(codes, samples, width, height, selectedPalette, edgeMap, options = {}) {
  const refined = codes.slice()
  const paletteByCode = selectedPalette.reduce((result, color) => {
    result[color.code] = color
    return result
  }, {})
  const unaryCache = new Map()
  const transitionCache = new Map()
  const maxIterations = options.maxIterations || 4
  const lambda = options.lambda || 2.75
  let totalChanges = 0
  let iterations = 0

  function unary(index, code) {
    const key = `${index}:${code}`
    if (!unaryCache.has(key)) unaryCache.set(key, ColorSpace.deltaE2000(samples[index].lab, paletteByCode[code].lab))
    return unaryCache.get(key)
  }

  function transition(first, second) {
    if (first === second) return 0
    const key = first < second ? `${first}:${second}` : `${second}:${first}`
    if (!transitionCache.has(key)) {
      const delta = ColorSpace.deltaE2000(paletteByCode[first].lab, paletteByCode[second].lab)
      transitionCache.set(key, 1 + Math.min(0.45, delta / 34))
    }
    return transitionCache.get(key)
  }

  function neighbors(index) {
    const x = index % width
    const y = Math.floor(index / width)
    const result = []
    if (x > 0) result.push(index - 1)
    if (x + 1 < width) result.push(index + 1)
    if (y > 0) result.push(index - width)
    if (y + 1 < height) result.push(index + width)
    return result
  }

  function energy(index, candidate, adjacent) {
    const detailProtection = 1 + edgeMap.localContrast[index] * 1.65
    let value = unary(index, candidate) * detailProtection
    for (const other of adjacent) {
      value += lambda * edgeMap.connectionWeight(index, other) * transition(candidate, refined[other])
    }
    return value
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = 0
    const reverse = iteration % 2 === 1
    for (let step = 0; step < refined.length; step += 1) {
      const index = reverse ? refined.length - 1 - step : step
      const adjacent = neighbors(index)
      const candidates = new Set([refined[index]])
      for (const other of adjacent) candidates.add(refined[other])

      let bestCode = refined[index]
      let bestEnergy = energy(index, bestCode, adjacent)
      for (const candidate of candidates) {
        if (candidate === bestCode) continue
        // High-contrast cells may still change between near-identical bead colors,
        // but cannot be pulled across a real outline by a distant color.
        if (edgeMap.localContrast[index] > 0.68 && transition(candidate, refined[index]) > 1.18) continue
        const candidateEnergy = energy(index, candidate, adjacent)
        if (candidateEnergy + 0.08 < bestEnergy) {
          bestCode = candidate
          bestEnergy = candidateEnergy
        }
      }
      if (bestCode !== refined[index]) {
        refined[index] = bestCode
        changed += 1
      }
    }
    iterations = iteration + 1
    totalChanges += changed
    if (!changed || changed / refined.length < 0.0015) break
  }

  return { codes: refined, changes: totalChanges, iterations }
}

const api = { refineSpatially }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadySpatialRefiner = api
})()
