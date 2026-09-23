(function () {
const ColorSpace = typeof window !== 'undefined' ? window.BeadyColorSpace : require('./colorSpace')

function findNearestPaletteColor(lab, palette) {
  let best = palette[0]
  let bestDistance = Infinity
  for (const color of palette) {
    const distance = ColorSpace.deltaE2000(lab, color.lab)
    if (distance < bestDistance) {
      best = color
      bestDistance = distance
    }
  }
  return { color: best, distance: bestDistance }
}

function mapCandidatesToPalette(candidates, palette) {
  const unique = new Map()
  for (const candidate of candidates) {
    const match = findNearestPaletteColor(candidate.lab, palette)
    const previous = unique.get(match.color.code)
    if (!previous || match.distance < previous.distance) {
      unique.set(match.color.code, { ...match.color, distance: match.distance })
    }
  }
  return Array.from(unique.values())
}

function matchLabToSelectedPalette(lab, selectedPalette) {
  return findNearestPaletteColor(lab, selectedPalette).color
}

const api = { findNearestPaletteColor, mapCandidatesToPalette, matchLabToSelectedPalette }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyColorMatcher = api
})()
