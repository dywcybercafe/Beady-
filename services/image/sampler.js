(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function averageCluster(pixels, assignments, clusterIndex) {
  let weight = 0; let r = 0; let g = 0; let b = 0; let l = 0; let a = 0; let labB = 0
  for (let index = 0; index < pixels.length; index += 1) {
    if (assignments[index] !== clusterIndex) continue
    const pixel = pixels[index]
    weight += pixel.weight
    r += pixel.rgb[0] * pixel.weight; g += pixel.rgb[1] * pixel.weight; b += pixel.rgb[2] * pixel.weight
    l += pixel.lab[0] * pixel.weight; a += pixel.lab[1] * pixel.weight; labB += pixel.lab[2] * pixel.weight
  }
  if (!weight) return null
  return { weight, rgb: [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)], lab: [l / weight, a / weight, labB / weight] }
}

function representativeFromRegion(pixels) {
  if (pixels.length === 1) return { ...pixels[0], edgeStrength: 0 }
  let darkest = pixels[0]; let lightest = pixels[0]
  for (const pixel of pixels) {
    if (pixel.lab[0] < darkest.lab[0]) darkest = pixel
    if (pixel.lab[0] > lightest.lab[0]) lightest = pixel
  }
  let centers = [darkest.lab.slice(), lightest.lab.slice()]
  const assignments = new Uint8Array(pixels.length)
  for (let iteration = 0; iteration < 5; iteration += 1) {
    for (let index = 0; index < pixels.length; index += 1) {
      const first = ColorSpace.labDistanceSquared(pixels[index].lab, centers[0])
      const second = ColorSpace.labDistanceSquared(pixels[index].lab, centers[1])
      assignments[index] = first <= second ? 0 : 1
    }
    const first = averageCluster(pixels, assignments, 0)
    const second = averageCluster(pixels, assignments, 1)
    if (!first || !second) break
    centers = [first.lab, second.lab]
  }
  const clusters = [averageCluster(pixels, assignments, 0), averageCluster(pixels, assignments, 1)].filter(Boolean)
  if (clusters.length === 1) return { ...clusters[0], edgeStrength: 0 }
  const separation = ColorSpace.deltaE2000(clusters[0].lab, clusters[1].lab)
  if (separation < 6.5) {
    const oneCluster = new Uint8Array(pixels.length)
    return { ...averageCluster(pixels, oneCluster, 0), edgeStrength: Math.min(1, separation / 18) }
  }
  clusters.sort((left, right) => right.weight - left.weight)
  const total = clusters[0].weight + clusters[1].weight
  const dark = clusters[0].lab[0] < clusters[1].lab[0] ? clusters[0] : clusters[1]
  let selected = clusters[0]
  // Preserve a genuine dark stroke when it covers a meaningful part of the bead.
  // The selected value is an observed mode, never a synthetic blend with the light region.
  if (dark.weight / total >= 0.31 && clusters[1].lab[0] - dark.lab[0] > 25) selected = dark
  return { ...selected, edgeStrength: Math.min(1, separation / 24) }
}

function sampleImageData(imageData, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const data = imageData.data || imageData
  const samples = new Array(targetWidth * targetHeight)
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const yStart = Math.floor(targetY * sourceHeight / targetHeight)
    const yEnd = Math.max(yStart + 1, Math.ceil((targetY + 1) * sourceHeight / targetHeight))
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const xStart = Math.floor(targetX * sourceWidth / targetWidth)
      const xEnd = Math.max(xStart + 1, Math.ceil((targetX + 1) * sourceWidth / targetWidth))
      const centerX = (xStart + xEnd - 1) / 2
      const centerY = (yStart + yEnd - 1) / 2
      const radiusX = Math.max(1, (xEnd - xStart) / 2)
      const radiusY = Math.max(1, (yEnd - yStart) / 2)
      const pixels = []
      for (let y = yStart; y < Math.min(yEnd, sourceHeight); y += 1) {
        for (let x = xStart; x < Math.min(xEnd, sourceWidth); x += 1) {
          const index = (y * sourceWidth + x) * 4
          const alpha = (data[index + 3] === undefined ? 255 : data[index + 3]) / 255
          const rgb = [Math.round(data[index] * alpha + 255 * (1 - alpha)), Math.round(data[index + 1] * alpha + 255 * (1 - alpha)), Math.round(data[index + 2] * alpha + 255 * (1 - alpha))]
          const distance = Math.min(1, Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY))
          pixels.push({ rgb, lab: ColorSpace.rgbToLab(rgb), weight: 1 + (1 - distance) * 0.32 })
        }
      }
      const representative = representativeFromRegion(pixels)
      samples[targetY * targetWidth + targetX] = { rgb: representative.rgb, lab: representative.lab, edgeStrength: representative.edgeStrength }
    }
  }
  return samples
}

const api = { sampleImageData, representativeFromRegion }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadySampler = api
})()
