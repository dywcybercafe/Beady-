(function () {
function srgbChannelToLinear(value) {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function linearChannelToSrgb(value) {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, channel)) * 255)
}

function rgbToLab(rgb) {
  const r = srgbChannelToLinear(rgb[0])
  const g = srgbChannelToLinear(rgb[1])
  const b = srgbChannelToLinear(rgb[2])

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883

  const transform = value => value > 0.008856451679
    ? Math.cbrt(value)
    : (7.787037037 * value) + (16 / 116)

  const fx = transform(x)
  const fy = transform(y)
  const fz = transform(z)

  return [
    (116 * fy) - 16,
    500 * (fx - fy),
    200 * (fy - fz)
  ]
}

function labDistanceSquared(left, right) {
  const dl = left[0] - right[0]
  const da = left[1] - right[1]
  const db = left[2] - right[2]
  return dl * dl + da * da + db * db
}

function degreesToRadians(value) {
  return value * Math.PI / 180
}

function radiansToDegrees(value) {
  return value * 180 / Math.PI
}

// Sharma, Wu and Dalal's CIEDE2000 implementation (kL = kC = kH = 1).
function deltaE2000(lab1, lab2) {
  const [l1, a1, b1] = lab1
  const [l2, a2, b2] = lab2
  const c1 = Math.sqrt(a1 * a1 + b1 * b1)
  const c2 = Math.sqrt(a2 * a2 + b2 * b2)
  const meanC = (c1 + c2) / 2
  const meanC7 = Math.pow(meanC, 7)
  const g = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + Math.pow(25, 7))))
  const a1Prime = (1 + g) * a1
  const a2Prime = (1 + g) * a2
  const c1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1)
  const c2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2)

  const hue = (b, a) => {
    const angle = radiansToDegrees(Math.atan2(b, a))
    return angle >= 0 ? angle : angle + 360
  }
  const h1Prime = hue(b1, a1Prime)
  const h2Prime = hue(b2, a2Prime)
  const deltaLPrime = l2 - l1
  const deltaCPrime = c2Prime - c1Prime
  const hueDifference = h2Prime - h1Prime
  let deltaHPrimeDegrees = 0
  if (c1Prime * c2Prime !== 0) {
    if (Math.abs(hueDifference) <= 180) deltaHPrimeDegrees = hueDifference
    else if (hueDifference > 180) deltaHPrimeDegrees = hueDifference - 360
    else deltaHPrimeDegrees = hueDifference + 360
  }
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(degreesToRadians(deltaHPrimeDegrees / 2))
  const meanLPrime = (l1 + l2) / 2
  const meanCPrime = (c1Prime + c2Prime) / 2

  let meanHPrime = h1Prime + h2Prime
  if (c1Prime * c2Prime !== 0) {
    if (Math.abs(h1Prime - h2Prime) <= 180) meanHPrime /= 2
    else if (meanHPrime < 360) meanHPrime = (meanHPrime + 360) / 2
    else meanHPrime = (meanHPrime - 360) / 2
  }

  const t = 1
    - 0.17 * Math.cos(degreesToRadians(meanHPrime - 30))
    + 0.24 * Math.cos(degreesToRadians(2 * meanHPrime))
    + 0.32 * Math.cos(degreesToRadians(3 * meanHPrime + 6))
    - 0.20 * Math.cos(degreesToRadians(4 * meanHPrime - 63))
  const deltaTheta = 30 * Math.exp(-Math.pow((meanHPrime - 275) / 25, 2))
  const meanCPrime7 = Math.pow(meanCPrime, 7)
  const rc = 2 * Math.sqrt(meanCPrime7 / (meanCPrime7 + Math.pow(25, 7)))
  const sl = 1 + (0.015 * Math.pow(meanLPrime - 50, 2)) / Math.sqrt(20 + Math.pow(meanLPrime - 50, 2))
  const sc = 1 + 0.045 * meanCPrime
  const sh = 1 + 0.015 * meanCPrime * t
  const rt = -Math.sin(degreesToRadians(2 * deltaTheta)) * rc
  const lTerm = deltaLPrime / sl
  const cTerm = deltaCPrime / sc
  const hTerm = deltaHPrime / sh

  return Math.sqrt(
    lTerm * lTerm +
    cTerm * cTerm +
    hTerm * hTerm +
    rt * cTerm * hTerm
  )
}

function relativeLuminance(rgb) {
  return 0.2126 * srgbChannelToLinear(rgb[0]) +
    0.7152 * srgbChannelToLinear(rgb[1]) +
    0.0722 * srgbChannelToLinear(rgb[2])
}

const api = {
  srgbChannelToLinear,
  linearChannelToSrgb,
  rgbToLab,
  labDistanceSquared,
  deltaE2000,
  relativeLuminance
}

if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyColorSpace = api
})()
