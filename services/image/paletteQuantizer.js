(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function chroma(lab) {
  return Math.hypot(lab[1], lab[2])
}

function perceptualDistance(sourceLab, targetLab) {
  const base = ColorSpace.deltaE2000(sourceLab, targetLab)
  const sourceChroma = chroma(sourceLab)
  const targetChroma = chroma(targetLab)
  let neutralPenalty = 0
  if (sourceChroma < 14) {
    const neutralStrength = (14 - sourceChroma) / 14
    const allowedChroma = Math.max(7, sourceChroma + 4)
    neutralPenalty += Math.max(0, targetChroma - allowedChroma) * 0.82 * neutralStrength
  }
  if ((sourceLab[0] < 24 || sourceLab[0] > 84) && sourceChroma < 12) {
    neutralPenalty += Math.max(0, targetChroma - 10) * 0.34
  }
  return base + neutralPenalty
}

function buildPoints(samples) {
  const buckets = new Map()
  for (const sample of samples) {
    const key = `${sample.rgb[0] >> 3},${sample.rgb[1] >> 3},${sample.rgb[2] >> 3}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
      existing.edgeTotal += sample.edgeStrength || 0
      existing.rgb[0] += sample.rgb[0]; existing.rgb[1] += sample.rgb[1]; existing.rgb[2] += sample.rgb[2]
      existing.lab[0] += sample.lab[0]; existing.lab[1] += sample.lab[1]; existing.lab[2] += sample.lab[2]
    } else {
      buckets.set(key, { count: 1, edgeTotal: sample.edgeStrength || 0, rgb: sample.rgb.slice(), lab: sample.lab.slice() })
    }
  }
  return Array.from(buckets.values()).map(point => ({
    count: point.count,
    edgeStrength: point.edgeTotal / point.count,
    weight: point.count * (1 + point.edgeTotal / point.count * 0.55),
    rgb: point.rgb.map(value => Math.round(value / point.count)),
    lab: point.lab.map(value => value / point.count)
  }))
}

function nearestColor(lab, palette, excludedCodes) {
  let best = null; let bestDistance = Infinity
  for (const color of palette) {
    if (excludedCodes && excludedCodes.has(color.code)) continue
    const distance = perceptualDistance(lab, color.lab)
    if (distance < bestDistance) { best = color; bestDistance = distance }
  }
  return { color: best, distance: bestDistance }
}

function refineMedoids(points, palette, selected) {
  let result = selected.slice()
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const groups = result.map(() => [])
    for (const point of points) {
      let bestIndex = 0; let bestDistance = Infinity
      for (let index = 0; index < result.length; index += 1) {
        const distance = perceptualDistance(point.lab, result[index].lab)
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index }
      }
      groups[bestIndex].push(point)
    }
    const next = []
    for (const group of groups) {
      if (!group.length) continue
      let bestColor = null; let bestCost = Infinity
      for (const color of palette) {
        let cost = 0
        for (const point of group) cost += perceptualDistance(point.lab, color.lab) * point.weight
        if (cost < bestCost) { bestCost = cost; bestColor = color }
      }
      if (bestColor && !next.some(color => color.code === bestColor.code)) next.push(bestColor)
    }
    if (!next.length) break
    result = next
  }
  return result
}

function selectPalette(samples, palette, requestedLimit) {
  const points = buildPoints(samples)
  const limit = Math.max(1, Math.min(64, Math.floor(requestedLimit || 24), palette.length))
  let first = palette[0]; let firstCost = Infinity
  for (const color of palette) {
    let cost = 0
    for (const point of points) cost += perceptualDistance(point.lab, color.lab) * point.weight
    if (cost < firstCost) { firstCost = cost; first = color }
  }
  const selected = [first]
  const selectedCodes = new Set([first.code])
  const minimumResidualScore = 6.2

  while (selected.length < limit) {
    let worstPoint = null; let worstScore = -1; let worstDistance = 0
    for (const point of points) {
      let distance = Infinity
      for (const color of selected) distance = Math.min(distance, perceptualDistance(point.lab, color.lab))
      const score = distance * (1 + point.edgeStrength * 0.85) * Math.pow(point.count, 0.28)
      if (score > worstScore) { worstScore = score; worstPoint = point; worstDistance = distance }
    }
    if (!worstPoint || worstScore < minimumResidualScore) break
    const candidate = nearestColor(worstPoint.lab, palette, selectedCodes)
    if (!candidate.color || candidate.distance >= worstDistance - 0.15) break
    selected.push(candidate.color)
    selectedCodes.add(candidate.color.code)
  }

  const refined = refineMedoids(points, palette, selected)
  return { selectedPalette: refined.slice(0, limit), pointCount: points.length }
}

function assignSamples(samples, selectedPalette) {
  return samples.map(sample => nearestColor(sample.lab, selectedPalette).color.code)
}

const api = { chroma, perceptualDistance, buildPoints, nearestColor, selectPalette, assignSamples }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyPaletteQuantizer = api
})()
