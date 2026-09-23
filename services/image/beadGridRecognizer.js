function rgbToLab(rgb) {
  const linear = rgb.map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883
  const f = value => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

function colorDistance(first, second) {
  const chromaA = Math.hypot(first[1], first[2])
  const chromaB = Math.hypot(second[1], second[2])
  if ((chromaA < 7 && chromaB > 15) || (chromaB < 7 && chromaA > 15)) return 100
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function projection(imageData, width, height, axis) {
  const length = axis === 'x' ? width : height
  const cross = axis === 'x' ? height : width
  const values = new Float32Array(length)
  for (let position = 1; position < length - 1; position += 1) {
    let sum = 0
    for (let other = 0; other < cross; other += Math.max(1, Math.floor(cross / 180))) {
      const x = axis === 'x' ? position : other
      const y = axis === 'x' ? other : position
      const previous = axis === 'x' ? ((y * width + x - 1) * 4) : (((y - 1) * width + x) * 4)
      const next = axis === 'x' ? ((y * width + x + 1) * 4) : (((y + 1) * width + x) * 4)
      sum += Math.abs(imageData[previous] - imageData[next]) + Math.abs(imageData[previous + 1] - imageData[next + 1]) + Math.abs(imageData[previous + 2] - imageData[next + 2])
    }
    values[position] = sum
  }
  return values
}

function findPeriod(signal) {
  const length = signal.length
  const maxLag = Math.min(90, Math.floor(length / 3))
  const minLag = Math.max(4, Math.floor(length / 160))
  let mean = 0
  for (const value of signal) mean += value
  mean /= Math.max(1, length)
  const centered = Array.from(signal, value => value - mean)
  const scores = []
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0; let firstEnergy = 0; let secondEnergy = 0
    for (let index = 0; index < length - lag; index += 1) {
      numerator += centered[index] * centered[index + lag]
      firstEnergy += centered[index] ** 2
      secondEnergy += centered[index + lag] ** 2
    }
    scores.push({ lag, score: numerator / Math.sqrt(Math.max(1e-9, firstEnergy * secondEnergy)) })
  }
  const peaks = scores.filter((entry, index) => index > 0 && index < scores.length - 1 && entry.score >= scores[index - 1].score && entry.score >= scores[index + 1].score)
  const best = (peaks.length ? peaks : scores).sort((a, b) => b.score - a.score)[0] || { lag: 0, score: 0 }
  const harmonic = peaks.filter(entry => entry.lag < best.lag && entry.score >= best.score * 0.82).sort((a, b) => a.lag - b.lag)[0]
  return harmonic ? { lag: Math.min(maxLag, harmonic.lag * 2), score: harmonic.score } : best
}

function estimateRegion(width, height, periodX, periodY) {
  const columns = Math.max(2, Math.round(width / periodX))
  const rows = Math.max(2, Math.round(height / periodY))
  const regionWidth = Math.min(width, columns * periodX)
  const regionHeight = Math.min(height, rows * periodY)
  return {
    x: Math.max(0, (width - regionWidth) / 2),
    y: Math.max(0, (height - regionHeight) / 2),
    width: regionWidth,
    height: regionHeight,
    columns,
    rows
  }
}

function sampleCell(data, width, height, centerX, centerY, cellWidth, cellHeight) {
  const points = []
  const radii = [0, 0.22, 0.34]
  for (const radius of radii) {
    const steps = radius === 0 ? 1 : 8
    for (let step = 0; step < steps; step += 1) {
      const angle = Math.PI * 2 * step / steps
      const x = Math.max(0, Math.min(width - 1, Math.round(centerX + Math.cos(angle) * cellWidth * radius)))
      const y = Math.max(0, Math.min(height - 1, Math.round(centerY + Math.sin(angle) * cellHeight * radius)))
      const index = (y * width + x) * 4
      points.push([data[index], data[index + 1], data[index + 2]])
    }
  }
  points.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))
  const middle = points[Math.floor(points.length / 2)]
  return middle.slice()
}

function groupSamples(samples, threshold = 10) {
  const groups = []
  const cells = []
  for (const row of samples) {
    const codeRow = []
    for (const rgb of row) {
      const lab = rgbToLab(rgb)
      let best = null; let bestDistance = Infinity
      for (const group of groups) {
        const distance = colorDistance(lab, group.lab)
        if (distance < bestDistance) { best = group; bestDistance = distance }
      }
      if (!best || bestDistance > threshold) {
        best = { code: `C${groups.length + 1}`, rgb: rgb.slice(), lab, count: 0 }
        groups.push(best)
      }
      best.count += 1
      const weight = 1 / best.count
      best.rgb = best.rgb.map((value, index) => Math.round(value + (rgb[index] - value) * weight))
      best.lab = rgbToLab(best.rgb)
      codeRow.push(best.code)
    }
    cells.push(codeRow)
  }
  const colors = groups.map(group => ({
    code: group.code,
    count: group.count,
    rgb: group.rgb,
    hex: `#${group.rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`
  })).sort((a, b) => b.count - a.count)
  return { cells, colors }
}

function recognize(image, width, height, options = {}) {
  const data = image.data || image
  const horizontal = findPeriod(projection(data, width, height, 'x'))
  const vertical = findPeriod(projection(data, width, height, 'y'))
  const fallback = Math.max(6, Math.min(width, height) / 32)
  const periodX = horizontal.lag || fallback
  const periodY = vertical.lag || fallback
  const region = options.region || estimateRegion(width, height, periodX, periodY)
  const cellWidth = region.width / region.columns
  const cellHeight = region.height / region.rows
  const samples = []
  for (let row = 0; row < region.rows; row += 1) {
    const sampleRow = []
    for (let column = 0; column < region.columns; column += 1) {
      sampleRow.push(sampleCell(data, width, height, region.x + (column + 0.5) * cellWidth, region.y + (row + 0.5) * cellHeight, cellWidth, cellHeight))
    }
    samples.push(sampleRow)
  }
  const grouped = groupSamples(samples, options.colorThreshold || 10)
  const aspectConsistency = Math.min(periodX, periodY) / Math.max(periodX, periodY)
  const confidence = Math.max(0, Math.min(1, (horizontal.score + vertical.score) * 0.5 * aspectConsistency))
  return {
    reliable: confidence >= 0.2 && region.columns >= 3 && region.rows >= 3,
    confidence,
    width: region.columns,
    height: region.rows,
    cells: grouped.cells,
    colors: grouped.colors,
    region: { x: region.x / width, y: region.y / height, width: region.width / width, height: region.height / height }
  }
}

const api = { recognize, rgbToLab, colorDistance, findPeriod, groupSamples }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyGridRecognizer = api
