(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function analyzeEdges(samples, width, height) {
  const horizontal = new Float32Array(Math.max(0, (width - 1) * height))
  const vertical = new Float32Array(Math.max(0, width * (height - 1)))
  const localContrast = new Float32Array(width * height)

  function similarity(left, right) {
    const delta = ColorSpace.deltaE2000(left.lab, right.lab)
    const sourceEdge = Math.max(left.edgeStrength || 0, right.edgeStrength || 0)
    const chromaticContinuity = Math.exp(-Math.pow(delta / 8.5, 2))
    return Math.max(0.015, chromaticContinuity * (1 - sourceEdge * 0.72))
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      let maximumDelta = 0
      let totalDelta = 0
      let neighborCount = 0
      if (x + 1 < width) {
        const delta = ColorSpace.deltaE2000(samples[index].lab, samples[index + 1].lab)
        horizontal[y * (width - 1) + x] = similarity(samples[index], samples[index + 1])
        maximumDelta = Math.max(maximumDelta, delta)
        totalDelta += delta
        neighborCount += 1
      }
      if (x > 0) {
        const delta = ColorSpace.deltaE2000(samples[index].lab, samples[index - 1].lab)
        maximumDelta = Math.max(maximumDelta, delta)
        totalDelta += delta
        neighborCount += 1
      }
      if (y + 1 < height) {
        const delta = ColorSpace.deltaE2000(samples[index].lab, samples[index + width].lab)
        vertical[y * width + x] = similarity(samples[index], samples[index + width])
        maximumDelta = Math.max(maximumDelta, delta)
        totalDelta += delta
        neighborCount += 1
      }
      if (y > 0) {
        const delta = ColorSpace.deltaE2000(samples[index].lab, samples[index - width].lab)
        maximumDelta = Math.max(maximumDelta, delta)
        totalDelta += delta
        neighborCount += 1
      }
      const meanDelta = neighborCount ? totalDelta / neighborCount : 0
      const sampledEdge = samples[index].edgeStrength || 0
      localContrast[index] = Math.min(1, Math.max(sampledEdge, maximumDelta / 18, meanDelta / 12))
    }
  }

  function connectionWeight(first, second) {
    const difference = second - first
    if (difference === 1) return horizontal[Math.floor(first / width) * (width - 1) + first % width]
    if (difference === -1) return horizontal[Math.floor(second / width) * (width - 1) + second % width]
    if (difference === width) return vertical[first]
    if (difference === -width) return vertical[second]
    return 0
  }

  return { horizontal, vertical, localContrast, connectionWeight }
}

const api = { analyzeEdges }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyEdgeDetector = api
})()
