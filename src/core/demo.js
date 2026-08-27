/**
 * The list shown when no goal files can be reached, so the board is never empty.
 * @module
 */

/** @type {import("./goals.js").GoalList} */
export const DEMO = {
  id: "demo",
  name: "Sample list",
  goals: [
    { text: "Open the menu", difficulty: 1, tags: ["misc"] },
    { text: "Talk to three villagers", difficulty: 1, tags: ["npc"] },
    { text: "Pick up a health item", difficulty: 1, tags: ["item"] },
    { text: "Change your equipment", difficulty: 1, tags: ["item"] },
    { text: "Find a hidden chest", difficulty: 2, tags: ["item"] },
    { text: "Beat one mini-boss", difficulty: 2, tags: ["combat"] },
    { text: "Reach the second area", difficulty: 2, tags: ["route"] },
    { text: "Buy something from a shop", difficulty: 2, tags: ["npc"] },
    { text: "Collect 10 currency", difficulty: 2, tags: ["collect"] },
    { text: "Finish a side quest", difficulty: 3, tags: ["npc"] },
    { text: "Clear a dungeon without dying", difficulty: 3, tags: ["combat", "dungeon"] },
    { text: "Reach 50% map completion", difficulty: 3, tags: ["collect"] },
    { text: "Unlock a fast travel point", difficulty: 3, tags: ["route"] },
    { text: "Upgrade a weapon twice", difficulty: 3, tags: ["item"] },
    { text: "Beat two dungeons", difficulty: 4, tags: ["dungeon"] },
    { text: "Collect 30 currency", difficulty: 4, tags: ["collect"] },
    { text: "Max out one stat", difficulty: 4, tags: ["stat"] },
    { text: "Clear the optional area", difficulty: 4, tags: ["route"] },
    { text: "Beat every mini-boss", difficulty: 5, tags: ["combat"] },
    { text: "Reach 100% map completion", difficulty: 5, tags: ["collect"] },
    { text: "Finish every side quest", difficulty: 5, tags: ["npc"] },
    { text: "Beat the game", difficulty: 5, tags: ["route"] }
  ]
};
