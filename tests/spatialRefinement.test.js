const assert = require('assert')
const MARD221 = require('../data/mard221')
const ColorSpace = require('../services/image/colorSpace')
const { generatePatternLegacy } = require('../services/image/legacyPatternGenerator')
const { generatePattern } = require('../services/image/patternGenerator')

function makeGradientSamples(width, height) {
  const samples = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const stripe = (x + y * 3) % 5 === 0 ? 8 : 0
      let rgb = [102 + x * 3 + stripe, 139 + x * 2 + stripe, 91 + x + stripe]
      let edgeStrength = 0.02
      if (x === 7 && y === 4) {
        rgb = [22, 25, 24]
        edgeStrength = 0.92
      }
      samples.push({ rgb, lab: ColorSpace.rgbToLab(rgb), edgeStrength })
    }
  }
  return samples
}

function transitionCount(pattern, ignoredIndex) {
  const { width, height, cells } = pattern
  let count = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (index === ignoredIndex) continue
      if (x + 1 < width && index + 1 !== ignoredIndex && cells[y][x] !== cells[y][x + 1]) count += 1
      if (y + 1 < height && index + width !== ignoredIndex && cells[y][x] !== cells[y + 1][x]) count += 1
    }
  }
  return count
}

async function run() {
  const width = 16
  const height = 9
  const featureIndex = 4 * width + 7
  const samples = makeGradientSamples(width, height)
  const options = { samples, width, height, colorLimit: 8, backgroundMode: 'keep', palette: MARD221 }
  const oldPattern = await generatePatternLegacy(options)
  const newPattern = await generatePattern(options)
  assert(newPattern.colors.length <= 8)
  assert(transitionCount(newPattern, featureIndex) <= transitionCount(oldPattern, featureIndex))
  assert.strictEqual(newPattern.cells[4][7], oldPattern.cells[4][7], 'high-contrast detail should keep its original label')
  assert(newPattern.metadata.spatialRefinement.iterations <= 4)
  console.log(`✓ spatial refinement: ${transitionCount(oldPattern, featureIndex)} → ${transitionCount(newPattern, featureIndex)} transitions; detail preserved`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
