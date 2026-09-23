(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function cleanSimilarRegions(codes, samples, width, height, paletteByCode, edgeMap, options = {}) {
  const cleaned = codes.slice()
  const maxRegionSize = options.maxRegionSize || 6
  const maxPasses = options.maxPasses || 2
  let totalChanges = 0

  function adjacent(index) {
    const x = index % width
    const y = Math.floor(index / width)
    const result = []
    if (x > 0) result.push(index - 1)
    if (x + 1 < width) result.push(index + 1)
    if (y > 0) result.push(index - width)
    if (y + 1 < height) result.push(index + width)
    return result
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const visited = new Uint8Array(cleaned.length)
    const replacements = []

    for (let start = 0; start < cleaned.length; start += 1) {
      if (visited[start]) continue
      const sourceCode = cleaned[start]
      const queue = [start]
      const region = []
      visited[start] = 1
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]
        region.push(index)
        for (const other of adjacent(index)) {
          if (!visited[other] && cleaned[other] === sourceCode) {
            visited[other] = 1
            queue.push(other)
          }
        }
      }
      if (region.length > maxRegionSize) continue

      const regionSet = new Set(region)
      const boundary = new Map()
      let contrastTotal = 0
      for (const index of region) {
        contrastTotal += edgeMap.localContrast[index]
        for (const other of adjacent(index)) {
          if (regionSet.has(other)) continue
          const code = cleaned[other]
          const entry = boundary.get(code) || { count: 0, weight: 0 }
          entry.count += 1
          entry.weight += edgeMap.connectionWeight(index, other)
          boundary.set(code, entry)
        }
      }
      if (!boundary.size || contrastTotal / region.length > 0.48) continue
      const ranked = Array.from(boundary.entries()).sort((a, b) => b[1].weight - a[1].weight || b[1].count - a[1].count)
      const [replacement, support] = ranked[0]
      const totalBoundary = ranked.reduce((sum, item) => sum + item[1].count, 0)
      if (support.count / totalBoundary < 0.58 || support.weight / support.count < 0.42) continue

      const paletteDelta = ColorSpace.deltaE2000(paletteByCode[sourceCode].lab, paletteByCode[replacement].lab)
      if (paletteDelta > 6.2) continue
      let unaryIncrease = 0
      for (const index of region) {
        unaryIncrease += ColorSpace.deltaE2000(samples[index].lab, paletteByCode[replacement].lab)
        unaryIncrease -= ColorSpace.deltaE2000(samples[index].lab, paletteByCode[sourceCode].lab)
      }
      if (unaryIncrease / region.length > 1.35) continue
      replacements.push({ region, replacement })
    }

    if (!replacements.length) break
    for (const item of replacements) {
      for (const index of item.region) {
        cleaned[index] = item.replacement
        totalChanges += 1
      }
    }
  }

  return { codes: cleaned, changes: totalChanges }
}

const api = { cleanSimilarRegions }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyRegionCleaner = api
})()
