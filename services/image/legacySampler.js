(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function sampleImageDataLegacy(imageData, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const data = imageData.data || imageData
  const samples = new Array(targetWidth * targetHeight)
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const yStart = Math.floor(targetY * sourceHeight / targetHeight)
    const yEnd = Math.max(yStart + 1, Math.ceil((targetY + 1) * sourceHeight / targetHeight))
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const xStart = Math.floor(targetX * sourceWidth / targetWidth)
      const xEnd = Math.max(xStart + 1, Math.ceil((targetX + 1) * sourceWidth / targetWidth))
      const pixels = []
      let linearR = 0; let linearG = 0; let linearB = 0; let totalWeight = 0; let minLuma = 1; let maxLuma = 0
      for (let y = yStart; y < Math.min(yEnd, sourceHeight); y += 1) {
        for (let x = xStart; x < Math.min(xEnd, sourceWidth); x += 1) {
          const index = (y * sourceWidth + x) * 4
          const alpha = (data[index + 3] === undefined ? 255 : data[index + 3]) / 255
          const rgb = [Math.round(data[index] * alpha + 255 * (1 - alpha)), Math.round(data[index + 1] * alpha + 255 * (1 - alpha)), Math.round(data[index + 2] * alpha + 255 * (1 - alpha))]
          const luma = ColorSpace.relativeLuminance(rgb)
          pixels.push({ rgb, luma })
          linearR += ColorSpace.srgbChannelToLinear(rgb[0]); linearG += ColorSpace.srgbChannelToLinear(rgb[1]); linearB += ColorSpace.srgbChannelToLinear(rgb[2])
          totalWeight += 1; minLuma = Math.min(minLuma, luma); maxLuma = Math.max(maxLuma, luma)
        }
      }
      const meanRgb = [ColorSpace.linearChannelToSrgb(linearR / totalWeight), ColorSpace.linearChannelToSrgb(linearG / totalWeight), ColorSpace.linearChannelToSrgb(linearB / totalWeight)]
      const meanLuma = ColorSpace.relativeLuminance(meanRgb)
      const edgeStrength = Math.min(1, (maxLuma - minLuma) / 0.55)
      let representative = meanRgb
      if (edgeStrength > 0.22 && pixels.length > 1) {
        let detailPixel = pixels[0]; let detailDistance = -1
        for (const pixel of pixels) {
          const distance = Math.abs(pixel.luma - meanLuma)
          if (distance > detailDistance) { detailDistance = distance; detailPixel = pixel }
        }
        const bias = Math.min(0.24, edgeStrength * 0.24)
        representative = meanRgb.map((value, channel) => Math.round(value * (1 - bias) + detailPixel.rgb[channel] * bias))
      }
      samples[targetY * targetWidth + targetX] = { rgb: representative, lab: ColorSpace.rgbToLab(representative), edgeStrength }
    }
  }
  return samples
}

const api = { sampleImageDataLegacy, sampleImageData: sampleImageDataLegacy }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyLegacySampler = api
})()
