/**
 * The win fanfare.
 *
 * Synthesised rather than shipped as a file: the site has no binary assets and
 * no dependencies, and a rising major arpeggio is a few oscillators. Built on
 * the click, which is the gesture browsers require before an AudioContext may
 * make noise.
 * @module
 */

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.50;

/** @type {AudioContext|null} */
let audio = null;

/**
 * @param {AudioNode} dest
 * @param {number} hz
 * @param {number} at
 * @param {number} dur
 * @param {number} level
 */
function voice(dest, hz, at, dur, level) {
  const ctx = /** @type {AudioContext} */ (audio);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(hz, at);
  // exponential ramps can't touch zero, hence the near-silent floor
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/**
 * @returns {boolean} false when audio is unavailable; the caller carries on silently
 */
export function fanfare() {
  const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!Ctx) return false;
  try {
    audio = audio || new Ctx();
    if (audio.state === "suspended") audio.resume();

    const master = audio.createGain();
    master.gain.value = 0.5;
    master.connect(audio.destination);

    const t0 = audio.currentTime + 0.03;
    const step = 0.11;
    [C5, E5, G5].forEach((hz, i) => voice(master, hz, t0 + i * step, 0.2, 0.55));
    voice(master, C6, t0 + 3 * step, 0.9, 0.6);                              // the note it lands on
    [C5, E5, G5].forEach(hz => voice(master, hz, t0 + 3 * step, 0.9, 0.25));  // triad under it
    return true;
  } catch (e) {
    return false;     // no audio device, autoplay policy, locked-down context
  }
}
