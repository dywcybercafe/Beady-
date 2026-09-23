(function () {
// V1 keeps this boundary explicit so a dependable subject-mask implementation
// can be inserted later without changing sampling, quantization or page code.
function processBackground(samples, mode) {
  return {
    samples,
    requestedMode: mode,
    appliedMode: 'keep',
    subjectRemovalApplied: false
  }
}

const api = { processBackground }
if (typeof module !== 'undefined' && module.exports) module.exports = api
if (typeof window !== 'undefined') window.BeadyBackgroundProcessor = api
})()
