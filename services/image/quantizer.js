(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function buildHistogram(samples) {
  const buckets = new Map()
  for (const sample of samples) {
    const key = `${sample.rgb[0] >> 3},${sample.rgb[1] >> 3},${sample.rgb[2] >> 3}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
      existing.edgeTotal += sample.edgeStrength
      existing.rgbTotal[0] += sample.rgb[0]
      existing.rgbTotal[1] += sample.rgb[1]
      existing.rgbTotal[2] += sample.rgb[2]
    } else {
      buckets.set(key, {
        count: 1,
        edgeTotal: sample.edgeStrength,
        rgbTotal: sample.rgb.slice()
      })
    }
  }

  return Array.from(buckets.values()).map(bucket => {
    const rgb = bucket.rgbTotal.map(value => Math.round(value / bucket.count))
    return {
      rgb,
      lab: ColorSpace.rgbToLab(rgb),
      count: bucket.count,
      edgeStrength: bucket.edgeTotal / bucket.count
    }
  })
}

function extractCandidateColors(samples, requestedLimit) {
  const points = buildHistogram(samples)
  const limit = Math.max(1, Math.min(64, Math.floor(requestedLimit || 24), points.length))
  if (points.length <= limit) return points.map(point => ({ rgb: point.rgb, lab: point.lab, weight: point.count }))

  const seeds = [points.reduce((best, point) => point.count > best.count ? point : best, points[0])]
  const minimumUsefulDistance = 6.5

  while (seeds.length < limit) {
    let bestPoint = null
    let bestScore = -1
    let bestDistance = 0

    for (const point of points) {
      let nearest = Infinity
      for (const seed of seeds) {
        nearest = Math.min(nearest, Math.sqrt(ColorSpace.labDistanceSquared(point.lab, seed.lab)))
      }
      const importance = 1 + Math.log2(point.count + 1) * 0.16 + point.edgeStrength * 0.55
      const score = nearest * importance
      if (score > bestScore) {
        bestScore = score
        bestDistance = nearest
        bestPoint = point
      }
    }

    if (!bestPoint || bestDistance < minimumUsefulDistance) break
    seeds.push(bestPoint)
  }

  let centers = seeds.map(seed => ({ lab: seed.lab.slice(), rgb: seed.rgb.slice(), weight: seed.count }))

  for (let iteration = 0; iteration < 9; iteration += 1) {
    const totals = centers.map(() => ({ l: 0, a: 0, b: 0, r: 0, g: 0, blue: 0, weight: 0 }))
    for (const point of points) {
      let bestIndex = 0
      let bestDistance = Infinity
      for (let index = 0; index < centers.length; index += 1) {
        const distance = ColorSpace.labDistanceSquared(point.lab, centers[index].lab)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }
      const weight = point.count * (1 + point.edgeStrength * 0.18)
      const total = totals[bestIndex]
      total.l += point.lab[0] * weight
      total.a += point.lab[1] * weight
      total.b += point.lab[2] * weight
      total.r += point.rgb[0] * weight
      total.g += point.rgb[1] * weight
      total.blue += point.rgb[2] * weight
      total.weight += weight
    }

    let movement = 0
    centers = centers.map((center, index) => {
      const total = totals[index]
      if (!total.weight) return center
      const next = {
        lab: [total.l / total.weight, total.a / total.weight, total.b / total.weight],
        rgb: [
          Math.round(total.r / total.weight),
          Math.round(total.g / total.weight),
          Math.round(total.blue / total.weight)
        ],
        weight: total.weight
      }
      movement += Math.sqrt(ColorSpace.labDistanceSquared(center.lab, next.lab))
      return next
    })
    if (movement / centers.length < 0.25) break
  }

  return centers
}

const api = { buildHistogram, extractCandidateColors }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyQuantizer = api
})()
