const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const MARD221 = require('../data/mard221')
const Sampler = require('../services/image/sampler')
const LegacySampler = require('../services/image/legacySampler')
const ColorSpace = require('../services/image/colorSpace')
const { generatePatternSpatialV2 } = require('../services/image/spatialV2PatternGenerator')
const { generatePattern } = require('../services/image/patternGenerator')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'benchmark/assets/original.jpg')
const dataDirectory = path.join(root, 'benchmark/data')
const generatedDirectory = path.join(root, 'benchmark/generated')
const paletteByCode = new Map(MARD221.map(color => [color.code, color]))
const limits = [16, 24, 32, 48]

async function loadSampleSets(width, height) {
  const oversample = 4
  const { data, info } = await sharp(sourcePath)
    .resize(width * oversample, height * oversample, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    old: LegacySampler.sampleImageData({ data }, info.width, info.height, width, height),
    new: Sampler.sampleImageData({ data }, info.width, info.height, width, height)
  }
}

function connectedComponents(pattern) {
  const { width, height, cells } = pattern
  const flat = cells.flat()
  const seen = new Uint8Array(flat.length)
  const sizes = []
  for (let start = 0; start < flat.length; start += 1) {
    if (seen[start]) continue
    const code = flat[start]
    const queue = [start]
    seen[start] = 1
    let size = 0
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]
      size += 1
      const x = index % width
      const y = Math.floor(index / width)
      const next = []
      if (x > 0) next.push(index - 1)
      if (x + 1 < width) next.push(index + 1)
      if (y > 0) next.push(index - width)
      if (y + 1 < height) next.push(index + width)
      for (const other of next) {
        if (!seen[other] && flat[other] === code) {
          seen[other] = 1
          queue.push(other)
        }
      }
    }
    sizes.push(size)
  }
  return sizes
}

function measure(pattern, samples) {
  const { width, height, cells } = pattern
  let flatPairs = 0
  let flatTransitions = 0
  let flatTransitionDelta = 0
  let edgePairs = 0
  let preservedEdges = 0
  let neutralCells = 0
  let neutralHueErrors = 0
  const visit = (first, second) => {
    const sourceDelta = ColorSpace.deltaE2000(samples[first].lab, samples[second].lab)
    const firstCode = pattern.cells[Math.floor(first / width)][first % width]
    const secondCode = pattern.cells[Math.floor(second / width)][second % width]
    if (sourceDelta < 5.5) {
      flatPairs += 1
      if (firstCode !== secondCode) {
        flatTransitions += 1
        flatTransitionDelta += ColorSpace.deltaE2000(paletteByCode.get(firstCode).lab, paletteByCode.get(secondCode).lab)
      }
    }
    if (sourceDelta > 13) {
      edgePairs += 1
      if (firstCode !== secondCode) preservedEdges += 1
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const sourceChroma = Math.hypot(samples[index].lab[1], samples[index].lab[2])
      const code = cells[y][x]
      const target = paletteByCode.get(code)
      if (sourceChroma < 10) {
        neutralCells += 1
        if (Math.hypot(target.lab[1], target.lab[2]) > 18) neutralHueErrors += 1
      }
      if (x + 1 < width) visit(index, index + 1)
      if (y + 1 < height) visit(index, index + width)
    }
  }
  const components = connectedComponents(pattern)
  return {
    colors: pattern.colors.length,
    components: components.length,
    tinyComponents: components.filter(size => size <= 2).length,
    flatTransitionRate: Number((flatTransitions / Math.max(1, flatPairs)).toFixed(4)),
    flatTransitionSeverity: Number((flatTransitionDelta / Math.max(1, flatPairs)).toFixed(4)),
    edgeRetention: Number((preservedEdges / Math.max(1, edgePairs)).toFixed(4)),
    neutralHueErrors,
    neutralHueErrorRate: Number((neutralHueErrors / Math.max(1, neutralCells)).toFixed(4)),
    refinement: pattern.metadata.spatialRefinement || null
  }
}

async function render(pattern, outputPath) {
  const { width, height } = pattern
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgb = paletteByCode.get(pattern.cells[y][x]).rgb
      const index = (y * width + x) * 3
      raw[index] = rgb[0]
      raw[index + 1] = rgb[1]
      raw[index + 2] = rgb[2]
    }
  }
  const cell = 10
  const lines = []
  for (let x = 0; x <= width; x += 1) lines.push(`<path d="M${x * cell} 0V${height * cell}"/>`)
  for (let y = 0; y <= height; y += 1) lines.push(`<path d="M0 ${y * cell}H${width * cell}"/>`)
  const grid = Buffer.from(`<svg width="${width * cell}" height="${height * cell}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".55">${lines.join('')}</g><rect x=".5" y=".5" width="${width * cell - 1}" height="${height * cell - 1}" fill="none" stroke="#24242d" stroke-width="2"/></svg>`)
  await sharp(raw, { raw: { width, height, channels: 3 } })
    .resize(width * cell, height * cell, { kernel: sharp.kernel.nearest })
    .composite([{ input: grid }])
    .png()
    .toFile(outputPath)
}

async function run() {
  fs.mkdirSync(dataDirectory, { recursive: true })
  fs.mkdirSync(generatedDirectory, { recursive: true })
  const width = 78
  const height = Math.round(width * 506 / 1080)
  const sampleSets = await loadSampleSets(width, height)
  const report = { generatedAt: new Date().toISOString(), sample: 'cat-street', width, height, limits: {} }

  for (const limit of limits) {
    const started = Date.now()
    const legacy = await generatePatternSpatialV2({ samples: sampleSets.old, width, height, colorLimit: limit, palette: MARD221 })
    const optimized = await generatePattern({ samples: sampleSets.new, width, height, colorLimit: limit, palette: MARD221 })
    const elapsedMs = Date.now() - started
    for (const [name, pattern] of [['old', legacy], ['new', optimized]]) {
      if (pattern.colors.length > limit) throw new Error(`${name}-${limit} exceeded color limit`)
      fs.writeFileSync(path.join(dataDirectory, `${name}-${limit}.json`), JSON.stringify(pattern))
      await render(pattern, path.join(generatedDirectory, `${name}-${limit}.png`))
    }
    report.limits[limit] = {
      elapsedMs,
      old: measure(legacy, sampleSets.old),
      new: measure(optimized, sampleSets.new)
    }
    console.log(`${limit} colors: ${elapsedMs}ms`, report.limits[limit])
  }
  fs.writeFileSync(path.join(dataDirectory, 'report.json'), JSON.stringify(report, null, 2))
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
