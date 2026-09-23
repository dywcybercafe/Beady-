(function () {
const PaletteQuantizer = typeof window !== 'undefined' ? window.BeadyPaletteQuantizer : require('./paletteQuantizer')

function cleanArtifacts(inputCodes, samples, width, height, paletteByCode, edgeMap, options = {}) {
  const codes = inputCodes.slice()
  const maxRegionSize = options.maxRegionSize || 4
  let changes = 0
  function neighbors(index) {
    const x = index % width; const y = Math.floor(index / width); const result = []
    if (x > 0) result.push(index - 1); if (x + 1 < width) result.push(index + 1)
    if (y > 0) result.push(index - width); if (y + 1 < height) result.push(index + width)
    return result
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const visited = new Uint8Array(codes.length)
    const replacements = []
    for (let start = 0; start < codes.length; start += 1) {
      if (visited[start]) continue
      const sourceCode = codes[start]; const queue = [start]; const region = []; visited[start] = 1
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]; region.push(index)
        for (const other of neighbors(index)) if (!visited[other] && codes[other] === sourceCode) { visited[other] = 1; queue.push(other) }
      }
      if (region.length > maxRegionSize) continue
      const regionSet = new Set(region); const boundary = new Map(); let localContrast = 0
      for (const index of region) {
        localContrast += edgeMap.localContrast[index]
        for (const other of neighbors(index)) {
          if (regionSet.has(other)) continue
          const code = codes[other]; const item = boundary.get(code) || { count: 0, weight: 0 }
          item.count += 1; item.weight += edgeMap.connectionWeight(index, other); boundary.set(code, item)
        }
      }
      if (!boundary.size || localContrast / region.length > 0.52) continue
      const candidates = Array.from(boundary.entries()).sort((a, b) => b[1].weight - a[1].weight)
      const totalBoundary = candidates.reduce((sum, entry) => sum + entry[1].count, 0)
      let best = null; let bestGain = 0
      for (const [replacement, support] of candidates) {
        if (support.count / totalBoundary < 0.5 || support.weight / support.count < 0.38) continue
        let gain = 0
        for (const index of region) {
          gain += PaletteQuantizer.perceptualDistance(samples[index].lab, paletteByCode[sourceCode].lab)
          gain -= PaletteQuantizer.perceptualDistance(samples[index].lab, paletteByCode[replacement].lab)
        }
        // A small non-positive tolerance allows removal of a near-tie artifact,
        // but a genuine black eye/mouth surrounded by white has a large negative gain and stays.
        const adjustedGain = gain / region.length + support.weight / support.count * 0.55
        if (adjustedGain > bestGain) { bestGain = adjustedGain; best = replacement }
      }
      if (best) replacements.push({ region, replacement: best })
    }
    if (!replacements.length) break
    for (const replacement of replacements) for (const index of replacement.region) { codes[index] = replacement.replacement; changes += 1 }
  }
  return { codes, changes }
}

const api = { cleanArtifacts }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyArtifactCleaner = api
})()
