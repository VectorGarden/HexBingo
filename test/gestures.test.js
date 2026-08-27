/**
 * Real platform event sequences, replayed as data.
 *
 * Each case is what a browser actually sends for one physical gesture. The two
 * marked as regressions are bugs that shipped: collapsing those sequences
 * wrongly claimed a hex the user was trying to block, and nearly blocked one
 * twice for a single hold.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PRESS_SLOP, createGestureState, reduce } from "../src/core/gestures.js";

/**
 * @param {import("../src/core/gestures.js").GestureEvent[]} events
 * @returns {string[]} the action for each event, in order
 */
function replay(events) {
  let state = createGestureState();
  return events.map(e => {
    const out = reduce(state, e);
    state = out.state;
    return out.action;
  });
}

/** Only the actions that do something to a hex. */
function intents(events) {
  return replay(events).filter(a => a === "claim" || a === "block" || a === "openMenu");
}

const down = (/** @type {any} */ o) => ({ type: "pointerdown", x: 0, y: 0, ...o });

// ── mouse ───────────────────────────────────────────────────

const MOUSE_LEFT_CLICK = [
  down({ pointerType: "mouse" }),
  { type: "pointerup" },
  { type: "click" }
];

const MOUSE_RIGHT_CLICK = [
  down({ pointerType: "mouse" }),
  { type: "contextmenu" },
  { type: "pointerup" }
  // no click: a real button-2 press sends none
];

/** macOS: a ctrl-click is a right-click, and sends a click as well. */
const MACOS_CTRL_CLICK = [
  down({ pointerType: "mouse" }),
  { type: "contextmenu" },
  { type: "pointerup" },
  { type: "click" }
];

// ── touch ───────────────────────────────────────────────────

const TOUCH_TAP = [
  down({ pointerType: "touch" }),
  { type: "pointerup" },
  { type: "click" }
];

const TOUCH_HOLD = [
  down({ pointerType: "touch" }),
  { type: "hold" },
  { type: "pointerup" },
  { type: "click" }
];

/** Android fires contextmenu partway through a hold, before the timer. */
const ANDROID_HOLD = [
  down({ pointerType: "touch" }),
  { type: "contextmenu" },
  { type: "hold" },
  { type: "pointerup" },
  { type: "click" }
];

const TOUCH_DRAG = [
  down({ pointerType: "touch" }),
  { type: "pointermove", x: PRESS_SLOP + 5, y: 0 },
  { type: "pointerup" },
  { type: "click" }
];

test("a left click claims the hex", () => {
  assert.deepEqual(intents(MOUSE_LEFT_CLICK), ["claim"]);
});

test("a right click blocks it, and sends no click to swallow", () => {
  assert.deepEqual(intents(MOUSE_RIGHT_CLICK), ["block"]);
});

test("regression: a macOS ctrl-click blocks once and does not then claim", () => {
  // shipped broken — contextmenu blocked it, then the trailing click claimed it
  assert.deepEqual(intents(MACOS_CTRL_CLICK), ["block"]);
  assert.deepEqual(replay(MACOS_CTRL_CLICK), ["cancelPress", "block", "cancelPress", "none"]);
});

test("a tap claims the hex", () => {
  assert.deepEqual(intents(TOUCH_TAP), ["claim"]);
});

test("a hold opens the menu and does not also claim", () => {
  assert.deepEqual(intents(TOUCH_HOLD), ["openMenu"]);
});

test("regression: an Android hold opens the menu without blocking as well", () => {
  // the contextmenu arrives mid-hold; acting on it too would fire twice
  assert.deepEqual(intents(ANDROID_HOLD), ["openMenu"]);
});

test("a press that drifts too far is a tap, not a hold", () => {
  assert.deepEqual(intents(TOUCH_DRAG), ["claim"]);
  assert.equal(replay(TOUCH_DRAG)[1], "cancelPress");
});

test("a press that drifts within tolerance still holds", () => {
  const steady = [
    down({ pointerType: "touch" }),
    { type: "pointermove", x: PRESS_SLOP - 1, y: 0 },
    { type: "hold" },
    { type: "pointerup" },
    { type: "click" }
  ];
  assert.deepEqual(intents(steady), ["openMenu"]);
});

test("a mouse press never starts a hold", () => {
  assert.equal(replay([down({ pointerType: "mouse" })])[0], "cancelPress");
  assert.equal(replay([down({ pointerType: "touch" })])[0], "startPress");
});

test("a pen press holds like a finger", () => {
  assert.deepEqual(intents([
    down({ pointerType: "pen" }), { type: "hold" }, { type: "pointerup" }, { type: "click" }
  ]), ["openMenu"]);
});

test("a swallowed click never leaks into the next interaction", () => {
  // right-click then left-click: the second must still claim
  assert.deepEqual(intents([...MOUSE_RIGHT_CLICK, ...MOUSE_LEFT_CLICK]), ["block", "claim"]);
  // and a hold then a tap
  assert.deepEqual(intents([...TOUCH_HOLD, ...TOUCH_TAP]), ["openMenu", "claim"]);
});

test("consecutive ctrl-clicks each block, toggling the hex", () => {
  assert.deepEqual(intents([...MACOS_CTRL_CLICK, ...MACOS_CTRL_CLICK]), ["block", "block"]);
});

test("a cancelled pointer leaves nothing owed", () => {
  const cancelled = [
    down({ pointerType: "touch" }),
    { type: "hold" },
    { type: "pointercancel" },
    ...TOUCH_TAP
  ];
  assert.deepEqual(intents(cancelled), ["openMenu", "claim"]);
});

test("a hold with no press behind it does nothing", () => {
  // the timer can outlive its press if the finger already lifted
  assert.deepEqual(replay([{ type: "hold" }]), ["none"]);
  assert.deepEqual(replay([down({ pointerType: "touch" }), { type: "pointerup" }, { type: "hold" }]),
    ["startPress", "cancelPress", "none"]);
});

test("an unknown event is inert", () => {
  assert.deepEqual(replay([/** @type {any} */ ({ type: "wheel" })]), ["none"]);
});

test("the reducer never mutates the state it is given", () => {
  const before = createGestureState();
  const snapshot = JSON.stringify(before);
  reduce(before, down({ pointerType: "touch" }));
  reduce(before, { type: "contextmenu" });
  assert.equal(JSON.stringify(before), snapshot);
});
