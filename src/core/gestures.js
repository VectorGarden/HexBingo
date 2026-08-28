/**
 * Gesture arbitration: which intent a sequence of raw input events adds up to.
 *
 * A hex has three intents — claim, block, and open the touch menu — but the
 * events that express them differ by platform, and collapsing them wrongly has
 * been the source of real bugs:
 *
 *   - Android sends `contextmenu` partway through a long press, so blocking
 *     there too would fire twice for one hold.
 *   - macOS turns a ctrl-click into `contextmenu` *and* an ordinary `click`,
 *     so blocking on the first and claiming on the second left the hex claimed
 *     when the user asked for the opposite.
 *
 * Keeping this pure — no DOM, no timers — means those sequences can be replayed
 * as data in a test. The caller owns the clock: it decides when a press has
 * lasted long enough and feeds in a `hold`.
 * @module
 */

/** How far a finger may drift and still count as a hold. */
export const PRESS_SLOP = 10;

/**
 * @typedef {object} GestureEvent
 * @property {"pointerdown"|"pointermove"|"pointerup"|"pointercancel"|"hold"|"click"|"contextmenu"} type
 * @property {string} [pointerType] "mouse", "touch" or "pen"
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {object} GestureState
 * @property {{x: number, y: number}|null} press an in-flight hold, if any
 * @property {boolean} swallowClick a click is owed to an interaction already handled
 */

/** @typedef {"none"|"claim"|"block"|"openMenu"|"startPress"|"cancelPress"} Action */

/** @returns {GestureState} */
export function createGestureState() {
  return { press: null, swallowClick: false };
}

/**
 * Fold one event into the state.
 *
 * `startPress` and `cancelPress` are instructions back to the caller about its
 * timer; every other action is something to do to the hex.
 * @param {GestureState} state
 * @param {GestureEvent} event
 * @returns {{state: GestureState, action: Action}}
 */
export function reduce(state, event) {
  switch (event.type) {
    case "pointerdown": {
      // a new interaction owes nothing to the last one
      const fresh = { press: null, swallowClick: false };
      if (event.pointerType === "mouse") {
        // the mouse has a right button and a wheel; it needs no hold
        return { state: fresh, action: "cancelPress" };
      }
      return {
        state: { ...fresh, press: { x: event.x || 0, y: event.y || 0 } },
        action: "startPress"
      };
    }

    case "pointermove": {
      if (!state.press) return { state, action: "none" };
      const drifted = Math.abs((event.x || 0) - state.press.x) > PRESS_SLOP ||
                      Math.abs((event.y || 0) - state.press.y) > PRESS_SLOP;
      if (!drifted) return { state, action: "none" };
      return { state: { ...state, press: null }, action: "cancelPress" };
    }

    case "pointerup":
      return { state: { ...state, press: null }, action: "cancelPress" };

    case "pointercancel":
      // the platform took the gesture away; no click will follow it
      return { state: { press: null, swallowClick: false }, action: "cancelPress" };

    case "hold":
      if (!state.press) return { state, action: "none" };
      // the hold has spoken for this interaction, so the trailing click is spent
      return { state: { press: state.press, swallowClick: true }, action: "openMenu" };

    case "contextmenu":
      // mid-hold on Android, or after one: the menu already covers it
      if (state.press || state.swallowClick) return { state, action: "none" };
      // ctrl-click on macOS sends a click after this one; it is spent too
      return { state: { ...state, swallowClick: true }, action: "block" };

    case "click":
      if (state.swallowClick) return { state: { ...state, swallowClick: false }, action: "none" };
      return { state, action: "claim" };

    default:
      return { state, action: "none" };
  }
}
