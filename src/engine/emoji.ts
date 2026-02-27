/**
 * Emoji constants — single source of truth for all emoji usage in the enterprise codebase.
 * 
 * Server-side: These return Unicode strings (for console.log, skill definitions, etc.)
 * Dashboard: The emoji-icons.js file maps these same chars to custom SVG icons.
 * 
 * RULE: Never use raw emoji literals. Always import from here.
 * If you need a new emoji, add it here first.
 */

export const Emoji = {
  // Status
  check: '\u2705',           // ✅
  cross: '\u274C',           // ❌
  warning: '\u26A0\uFE0F',  // ⚠️
  blocked: '\uD83D\uDEAB',  // 🚫
  bolt: '\u26A1',            // ⚡
  hourglass: '\u23F3',       // ⏳
  clock: '\u23F0',           // ⏰

  // Communication
  email: '\u2709\uFE0F',    // ✉️
  envelope: '\uD83D\uDCE7', // 📧
  chat: '\uD83D\uDCAC',     // 💬
  whatsapp: '\uD83D\uDCF2',  // 📲 (WhatsApp — green circle in dashboard SVG)
  telegram: '\u2708\uFE0F',  // ✈️ (Telegram — blue paper plane in dashboard SVG)
  mailbox: '\uD83D\uDCEC',  // 📬

  // Documents
  clipboard: '\uD83D\uDCCB', // 📋
  note: '\uD83D\uDCDD',      // 📝
  document: '\uD83D\uDCC4',  // 📄
  scroll: '\uD83D\uDCC4',    // 📄
  notebook: '\uD83D\uDCD3',  // 📓
  books: '\uD83D\uDCDA',     // 📚
  pin: '\uD83D\uDCCC',       // 📌

  // Data & Charts
  barChart: '\uD83D\uDCCA',  // 📊
  chartUp: '\uD83D\uDCC8',   // 📈
  calendar: '\uD83D\uDCC5',  // 📅

  // Files & Storage
  folder: '\uD83D\uDCC1',    // 📁
  database: '\uD83D\uDDC4\uFE0F', // 🗄️
  package: '\uD83D\uDCE6',   // 📦

  // Tools & Settings
  gear: '\u2699\uFE0F',      // ⚙️
  wrench: '\uD83D\uDD27',    // 🔧
  key: '\uD83D\uDD11',       // 🔑
  lock: '\uD83D\uDD12',      // 🔒
  shield: '\uD83D\uDEE1',    // 🛡
  pen: '\uD83D\uDD8A',       // 🖊

  // Media & Visuals
  video: '\uD83C\uDFA5',     // 🎥
  art: '\uD83C\uDFA8',       // 🎨
  projector: '\uD83D\uDCFD', // 📽
  sparkle: '\u2728',          // ✨

  // Navigation & Networking
  globe: '\uD83C\uDF10',     // 🌐
  map: '\uD83D\uDDFA\uFE0F', // 🗺️
  link: '\uD83D\uDD17',      // 🔗
  shuffle: '\uD83D\uDD00',   // 🔀
  biDirectional: '\u2194\uFE0F', // ↔️

  // People & AI
  people: '\uD83D\uDC65',    // 👥
  robot: '\uD83E\uDD16',     // 🤖
  brain: '\uD83E\uDDE0',     // 🧠
  thumbsUp: '\uD83D\uDC4D',  // 👍

  // Nature & Weather
  sunrise: '\uD83C\uDF05',   // 🌅
  cloud: '\u2601\uFE0F',     // ☁️
  partlyCloudy: '\u26C5',    // ⛅
  sunCloud: '\uD83C\uDF24\uFE0F', // 🌤️

  // Misc
  rocket: '\uD83D\uDE80',    // 🚀
  building: '\uD83C\uDFE2',  // 🏢
  vault: '\uD83C\uDFDB',     // 🏛
  construction: '\uD83C\uDFD7', // 🏗
  computer: '\uD83D\uDCBB',  // 💻
  terminal: '\uD83D\uDDA5\uFE0F', // 🖥️ (terminal/shell — maps to terminal SVG in dashboard)
  lobster: '\uD83E\uDD9E',   // 🦞
  heart: '\uD83D\uDC9C',     // 💜
  redHeart: '\u2764\uFE0F',  // ❤️

  // Colors
  blueCircle: '\uD83D\uDD35',   // 🔵
  blueDiamond: '\uD83D\uDD37',  // 🔷
  orangeCircle: '\uD83D\uDFE0', // 🟠

  // Vision
  eye: '\uD83D\uDC41',       // 👁

  // Arrows
  triangleUp: '\u25B2',    // ▲
  triangleDown: '\u25BC',  // ▼
} as const;

export type EmojiKey = keyof typeof Emoji;
