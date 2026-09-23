const assert = require('assert')
const MARD221 = require('../data/mard221')
const ColorSpace = require('../services/image/colorSpace')
const Sampler = require('../services/image/sampler')
const { generatePattern } = require('../services/image/patternGenerator')
const PaletteQuantizer = require('../services/image/paletteQuantizer')

function makeImage(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgb = pixelAt(x, y, width, height)
      const index = (y * width + x) * 4
      data[index] = rgb[0]
      data[index + 1] = rgb[1]
      data[index + 2] = rgb[2]
      data[index + 3] = 255
    }
  }
  return { data }
}

function hsvToRgb(h, s, v) {
  const sector = Math.floor(h * 6)
  const fraction = h * 6 - sector
  const p = v * (1 - s)
  const q = v * (1 - fraction * s)
  const t = v * (1 - (1 - fraction) * s)
  const values = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][sector % 6]
  return values.map(value => Math.round(value * 255))
}

const fixtures = [
  {
    name: 'cartoon character', width: 52, height: 52, limit: 16,
    pixelAt(x, y, width, height) {
      const cx = x / width - 0.5
      const cy = y / height - 0.5
      if (cx * cx + cy * cy > 0.18) return [245, 239, 220]
      if ((cx + 0.14) ** 2 + (cy + 0.08) ** 2 < 0.012 || (cx - 0.14) ** 2 + (cy + 0.08) ** 2 < 0.012) return [22, 24, 29]
      if (Math.abs(cx) < 0.12 && cy > 0.12 && cy < 0.17) return [215, 63, 91]
      return cy < 0 ? [91, 180, 231] : [117, 85, 218]
    }
  },
  {
    name: 'photo-like animal portrait', width: 78, height: 78, limit: 24,
    pixelAt(x, y, width, height) {
      const nx = x / width - 0.5
      const ny = y / height - 0.5
      const radial = Math.sqrt(nx * nx + ny * ny)
      const noise = ((x * 37 + y * 61 + x * y * 3) % 31) - 15
      if (radial > 0.48) return [170 + noise, 187 + noise, 145 + noise]
      if ((nx + 0.16) ** 2 + (ny + 0.08) ** 2 < 0.009 || (nx - 0.16) ** 2 + (ny + 0.08) ** 2 < 0.009) return [19, 17, 15]
      if (Math.abs(nx) < 0.07 && ny > 0.02 && ny < 0.10) return [190, 108, 105]
      const shade = Math.round((1 - radial) * 55 + noise)
      return [165 + shade, 122 + shade, 82 + shade]
    }
  },
  {
    name: 'rich color image', width: 104, height: 104, limit: 32,
    pixelAt(x, y, width, height) {
      return hsvToRgb((x / width * 0.72 + y / height * 0.28) % 1, 0.72, 0.55 + 0.42 * (1 - y / height))
    }
  },
  {
    name: 'maximum preset size', width: 120, height: 120, limit: 48,
    pixelAt(x, y, width, height) {
      const band = Math.floor((x / width) * 7) / 7
      const detail = (x - 60) ** 2 + (y - 60) ** 2 < 90 ? 0.18 : 0
      return hsvToRgb(0.2 + band * 0.32, 0.35 + detail, 0.62 + y / height * 0.25 - detail)
    }
  },
  {
    name: 'flat illustration', width: 113, height: 78, limit: 64,
    pixelAt(x, y, width, height) {
      if (x < width / 2 && y < height / 2) return [246, 103, 136]
      if (x >= width / 2 && y < height / 2) return [255, 190, 47]
      if (x < width / 2) return [77, 191, 122]
      return [105, 82, 242]
    }
  }
]

function validatePattern(pattern, fixture) {
  assert.strictEqual(pattern.width, fixture.width)
  assert.strictEqual(pattern.height, fixture.height)
  assert.strictEqual(pattern.cells.length, fixture.height)
  assert(pattern.cells.every(row => row.length === fixture.width))
  assert(pattern.colors.length <= fixture.limit, `${fixture.name} exceeded its color limit`)
  const validCodes = new Set(MARD221.map(color => color.code))
  const counts = new Map()
  for (const row of pattern.cells) {
    for (const code of row) {
      assert(validCodes.has(code), `Illegal MARD code: ${code}`)
      counts.set(code, (counts.get(code) || 0) + 1)
    }
  }
  assert.strictEqual(Array.from(counts.values()).reduce((sum, count) => sum + count, 0), fixture.width * fixture.height)
  assert.deepStrictEqual(pattern.colors, Array.from(counts.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)))
}

async function run() {
  assert.strictEqual(MARD221.length, 221)
  assert.strictEqual(new Set(MARD221.map(color => color.code)).size, 221)
  assert(Math.abs(ColorSpace.deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 0.0002)
  const neutralLab = ColorSpace.rgbToLab([225, 225, 225])
  const neutralMatch = PaletteQuantizer.nearestColor(neutralLab, MARD221).color
  assert(Math.hypot(neutralMatch.lab[1], neutralMatch.lab[2]) < 16, 'neutral input must not map to a saturated bead color')

  const started = Date.now()
  for (const fixture of fixtures) {
    const scale = 4
    const sourceWidth = fixture.width * scale
    const sourceHeight = fixture.height * scale
    const image = makeImage(sourceWidth, sourceHeight, fixture.pixelAt)
    const samples = Sampler.sampleImageData(image, sourceWidth, sourceHeight, fixture.width, fixture.height)
    const pattern = await generatePattern({
      samples,
      width: fixture.width,
      height: fixture.height,
      colorLimit: fixture.limit,
      backgroundMode: fixture.name === 'flat illustration' ? 'subject' : 'keep',
      palette: MARD221
    })
    validatePattern(pattern, fixture)
    assert.strictEqual(pattern.metadata.algorithm, 'mard-constrained-clean-v3')
    if (fixture.name === 'flat illustration') assert.strictEqual(pattern.metadata.subjectRemovalApplied, false)
    console.log(`✓ ${fixture.name}: ${fixture.width}×${fixture.height}, ${pattern.colors.length}/${fixture.limit} colors`)
  }
  const elapsed = Date.now() - started
  assert(elapsed < 15000, `Core tests took too long: ${elapsed}ms`)
  console.log(`All pattern tests passed in ${elapsed}ms`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
