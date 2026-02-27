/**
 * Custom Emoji Icons — AgenticMail Enterprise
 * 
 * Replaces all raw Unicode emojis across the dashboard with custom SVGs.
 * Style: Colorful, rounded, modern — with filled gradients and soft shapes.
 * Each icon is a function returning an SVG vnode via h().
 * 
 * Usage: import { E } from './assets/icons/emoji-icons.js';
 *        E.bolt()   // ⚡
 *        E.email()  // 📧
 */

import { h } from '../../components/utils.js';

var D = { viewBox: '0 0 24 24', width: 20, height: 20 };

function svg(props) {
  return Object.assign({}, D, props);
}

export const E = {

  // ⚡ Bolt / Energy — warm amber with orange gradient feel
  bolt: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'bolt-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#f59e0b' }),
          h('stop', { offset: '100%', stopColor: '#ef4444' })
        )
      ),
      h('path', { d: 'M13 2L4.5 13.5h5L8 22l9.5-12.5h-5.5L13 2z', fill: 'url(#bolt-g)', stroke: 'none' })
    );
  },

  // 🛡 Shield / Security — deep indigo to violet
  shield: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'shield-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#6366f1' }),
          h('stop', { offset: '100%', stopColor: '#8b5cf6' })
        )
      ),
      h('path', { d: 'M12 2L4 5.5v5c0 5.25 3.4 10.15 8 11.5 4.6-1.35 8-6.25 8-11.5v-5L12 2z', fill: 'url(#shield-g)', stroke: 'none' }),
      h('path', { d: 'M9 12l2 2 4-4', stroke: '#fff', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  },

  // 💬 Chat / Communication — teal to cyan bubble
  chat: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'chat-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#06b6d4' }),
          h('stop', { offset: '100%', stopColor: '#3b82f6' })
        )
      ),
      h('path', { d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', fill: 'url(#chat-g)', stroke: 'none' }),
      h('circle', { cx: 8.5, cy: 11, r: 1.2, fill: '#fff' }),
      h('circle', { cx: 12, cy: 11, r: 1.2, fill: '#fff' }),
      h('circle', { cx: 15.5, cy: 11, r: 1.2, fill: '#fff' })
    );
  },

  // 🧠 Brain / AI / Knowledge — pink to magenta organic shape
  brain: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'brain-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#ec4899' }),
          h('stop', { offset: '100%', stopColor: '#a855f7' })
        )
      ),
      h('path', { d: 'M12 2C9 2 7 4 7 6.5c0 .5.1 1 .2 1.5C5.3 8.6 4 10.2 4 12c0 1.5.8 2.8 2 3.5-.1.3-.1.7 0 1C6 18.5 7.5 20 9.5 20c.7 0 1.3-.2 1.8-.5.2.3.5.5.7.5.2 0 .5-.2.7-.5.5.3 1.1.5 1.8.5 2 0 3.5-1.5 3.5-3.5 0-.3 0-.7-.1-1 1.2-.7 2-2 2-3.5 0-1.8-1.3-3.4-3.2-3.9.2-.5.3-1 .3-1.6C17 4 15 2 12 2z', fill: 'url(#brain-g)', stroke: 'none' }),
      h('path', { d: 'M12 5v14', stroke: '#fff', strokeWidth: 1.5, fill: 'none', opacity: 0.6 }),
      h('path', { d: 'M8 9c2 1 4 1 4 1', stroke: '#fff', strokeWidth: 1.2, fill: 'none', opacity: 0.5, strokeLinecap: 'round' }),
      h('path', { d: 'M16 9c-2 1-4 1-4 1', stroke: '#fff', strokeWidth: 1.2, fill: 'none', opacity: 0.5, strokeLinecap: 'round' }),
      h('path', { d: 'M8 14c2-1 4-1 4-1', stroke: '#fff', strokeWidth: 1.2, fill: 'none', opacity: 0.5, strokeLinecap: 'round' }),
      h('path', { d: 'M16 14c-2-1-4-1-4-1', stroke: '#fff', strokeWidth: 1.2, fill: 'none', opacity: 0.5, strokeLinecap: 'round' })
    );
  },

  // 📋 Clipboard / Tasks — emerald green with check
  clipboard: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'clip-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#10b981' }),
          h('stop', { offset: '100%', stopColor: '#059669' })
        )
      ),
      h('rect', { x: 5, y: 4, width: 14, height: 18, rx: 2, fill: 'url(#clip-g)', stroke: 'none' }),
      h('rect', { x: 8, y: 2, width: 8, height: 4, rx: 1, fill: '#065f46', stroke: 'none' }),
      h('line', { x1: 8, y1: 11, x2: 16, y2: 11, stroke: '#fff', strokeWidth: 1.5, opacity: 0.7, strokeLinecap: 'round' }),
      h('line', { x1: 8, y1: 14.5, x2: 14, y2: 14.5, stroke: '#fff', strokeWidth: 1.5, opacity: 0.7, strokeLinecap: 'round' }),
      h('line', { x1: 8, y1: 18, x2: 12, y2: 18, stroke: '#fff', strokeWidth: 1.5, opacity: 0.5, strokeLinecap: 'round' })
    );
  },

  // 📜 Scroll / Policy / Document — warm parchment
  scroll: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'scroll-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#fbbf24' }),
          h('stop', { offset: '100%', stopColor: '#d97706' })
        )
      ),
      h('path', { d: 'M6 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H6zM4 6v12a2 2 0 002 2h8l4-4V6H4z', fill: 'url(#scroll-g)', stroke: 'none' }),
      h('path', { d: 'M14 16v4l4-4h-4z', fill: '#b45309', stroke: 'none', opacity: 0.5 }),
      h('line', { x1: 7, y1: 10, x2: 15, y2: 10, stroke: '#78350f', strokeWidth: 1.2, opacity: 0.5, strokeLinecap: 'round' }),
      h('line', { x1: 7, y1: 13, x2: 13, y2: 13, stroke: '#78350f', strokeWidth: 1.2, opacity: 0.5, strokeLinecap: 'round' })
    );
  },

  // ⚙ Gear / Settings — slate gray metallic
  gear: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'gear-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#64748b' }),
          h('stop', { offset: '100%', stopColor: '#475569' })
        )
      ),
      h('circle', { cx: 12, cy: 12, r: 3.5, fill: '#334155', stroke: 'none' }),
      h('path', { d: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z', fill: 'url(#gear-g)', stroke: 'none' })
    );
  },

  // 📧 Email / Envelope — coral to rose
  email: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'email-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#f43f5e' }),
          h('stop', { offset: '100%', stopColor: '#e11d48' })
        )
      ),
      h('rect', { x: 2, y: 5, width: 20, height: 14, rx: 2.5, fill: 'url(#email-g)', stroke: 'none' }),
      h('polyline', { points: '2 5 12 13 22 5', stroke: '#fff', strokeWidth: 1.8, fill: 'none', strokeLinejoin: 'round', opacity: 0.85 })
    );
  },

  // 🏢 Building / Microsoft / Enterprise — slate blue corporate
  building: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'bldg-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#3b82f6' }),
          h('stop', { offset: '100%', stopColor: '#1e40af' })
        )
      ),
      h('rect', { x: 4, y: 3, width: 16, height: 19, rx: 1.5, fill: 'url(#bldg-g)', stroke: 'none' }),
      h('rect', { x: 7, y: 6, width: 3, height: 2.5, rx: 0.5, fill: '#93c5fd', stroke: 'none' }),
      h('rect', { x: 14, y: 6, width: 3, height: 2.5, rx: 0.5, fill: '#93c5fd', stroke: 'none' }),
      h('rect', { x: 7, y: 11, width: 3, height: 2.5, rx: 0.5, fill: '#93c5fd', stroke: 'none' }),
      h('rect', { x: 14, y: 11, width: 3, height: 2.5, rx: 0.5, fill: '#93c5fd', stroke: 'none' }),
      h('rect', { x: 10, y: 17, width: 4, height: 5, rx: 0.5, fill: '#bfdbfe', stroke: 'none' })
    );
  },

  // 🔵 Google / Circle — Google's multicolor
  google: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 2a10 10 0 00-6.88 17.23L12 12V2z', fill: '#ea4335', stroke: 'none' }),
      h('path', { d: 'M5.12 19.23A10 10 0 0012 22v-10L5.12 19.23z', fill: '#34a853', stroke: 'none' }),
      h('path', { d: 'M12 2v10l6.88 7.23A10 10 0 0012 2z', fill: '#4285f4', stroke: 'none' }),
      h('path', { d: 'M12 12v10a10 10 0 006.88-2.77L12 12z', fill: '#fbbc05', stroke: 'none' }),
      h('circle', { cx: 12, cy: 12, r: 4, fill: '#fff', stroke: 'none' })
    );
  },

  // 🔑 Key / API Key — golden key
  key: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'key-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#fbbf24' }),
          h('stop', { offset: '100%', stopColor: '#f59e0b' })
        )
      ),
      h('circle', { cx: 8, cy: 15, r: 5, fill: 'url(#key-g)', stroke: 'none' }),
      h('circle', { cx: 8, cy: 15, r: 2, fill: '#78350f', stroke: 'none', opacity: 0.3 }),
      h('rect', { x: 12, y: 8, width: 9, height: 3.5, rx: 1, fill: 'url(#key-g)', stroke: 'none', transform: 'rotate(-45 12 10)' }),
      h('rect', { x: 17, y: 5, width: 2, height: 4, rx: 0.5, fill: '#d97706', stroke: 'none', transform: 'rotate(-45 18 7)' })
    );
  },

  // ✓ ✅ Checkmark — vivid green circle with white check
  checkCircle: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#22c55e', stroke: 'none' }),
      h('path', { d: 'M7.5 12.5l3 3 6-6', stroke: '#fff', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  },

  // ❌ Cross / Error — red circle
  crossCircle: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#ef4444', stroke: 'none' }),
      h('path', { d: 'M8 8l8 8M16 8l-8 8', stroke: '#fff', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' })
    );
  },

  // ⚠️ Warning — amber triangle
  warning: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 2L1.5 21h21L12 2z', fill: '#f59e0b', stroke: 'none' }),
      h('line', { x1: 12, y1: 9, x2: 12, y2: 14, stroke: '#78350f', strokeWidth: 2.5, strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 17, r: 1.2, fill: '#78350f', stroke: 'none' })
    );
  },

  // 🔔 Bell / Notification — warm orange bell
  bell: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'bell-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#fb923c' }),
          h('stop', { offset: '100%', stopColor: '#ea580c' })
        )
      ),
      h('path', { d: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', fill: 'url(#bell-g)', stroke: 'none' }),
      h('path', { d: 'M13.73 21a2 2 0 01-3.46 0', stroke: '#ea580c', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' })
    );
  },

  // 🔒 Lock — secure blue padlock
  lock: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'lock-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#6366f1' }),
          h('stop', { offset: '100%', stopColor: '#4338ca' })
        )
      ),
      h('rect', { x: 5, y: 11, width: 14, height: 11, rx: 2, fill: 'url(#lock-g)', stroke: 'none' }),
      h('path', { d: 'M8 11V7a4 4 0 018 0v4', stroke: '#6366f1', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 16, r: 1.5, fill: '#c7d2fe', stroke: 'none' })
    );
  },

  // 🚀 Rocket — gradient launch
  rocket: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'rock-g', x1: '0%', y1: '100%', x2: '100%', y2: '0%' },
          h('stop', { offset: '0%', stopColor: '#3b82f6' }),
          h('stop', { offset: '100%', stopColor: '#8b5cf6' })
        )
      ),
      h('path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3M22 2l-7.5 7.5', stroke: '#6366f1', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round' }),
      h('path', { d: 'M9.59 11.41l-1.82-1.82a2 2 0 00-2.83 0L2 12.59l4.17 4.17M12.59 14.41l1.82 1.82a2 2 0 010 2.83L11.41 22l-4.17-4.17', fill: 'url(#rock-g)', stroke: 'none', opacity: 0.6 }),
      h('path', { d: 'M22 2S15 4 12 7l-3 3 3 3c3-3 5-10 5-10', fill: 'url(#rock-g)', stroke: 'none' })
    );
  },

  // 📊 Chart / Analytics — purple bars
  barChart: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 4, y: 13, width: 4, height: 8, rx: 1, fill: '#a78bfa', stroke: 'none' }),
      h('rect', { x: 10, y: 8, width: 4, height: 13, rx: 1, fill: '#8b5cf6', stroke: 'none' }),
      h('rect', { x: 16, y: 3, width: 4, height: 18, rx: 1, fill: '#7c3aed', stroke: 'none' })
    );
  },

  // 🤖 Robot / Agent — friendly bot face
  robot: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'bot-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#60a5fa' }),
          h('stop', { offset: '100%', stopColor: '#3b82f6' })
        )
      ),
      h('rect', { x: 4, y: 6, width: 16, height: 14, rx: 3, fill: 'url(#bot-g)', stroke: 'none' }),
      h('circle', { cx: 9, cy: 13, r: 2, fill: '#fff', stroke: 'none' }),
      h('circle', { cx: 15, cy: 13, r: 2, fill: '#fff', stroke: 'none' }),
      h('circle', { cx: 9, cy: 13, r: 1, fill: '#1e3a5f', stroke: 'none' }),
      h('circle', { cx: 15, cy: 13, r: 1, fill: '#1e3a5f', stroke: 'none' }),
      h('line', { x1: 12, y1: 3, x2: 12, y2: 6, stroke: '#60a5fa', strokeWidth: 2, strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 2, r: 1.5, fill: '#60a5fa', stroke: 'none' }),
      h('rect', { x: 10, y: 17, width: 4, height: 1.5, rx: 0.75, fill: '#bfdbfe', stroke: 'none' })
    );
  },

  // 🌐 Globe / Network — earth tones
  globe: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#0ea5e9', stroke: 'none' }),
      h('ellipse', { cx: 12, cy: 12, rx: 4.5, ry: 10, fill: 'none', stroke: '#fff', strokeWidth: 1.2, opacity: 0.5 }),
      h('line', { x1: 2, y1: 12, x2: 22, y2: 12, stroke: '#fff', strokeWidth: 1.2, opacity: 0.5 }),
      h('path', { d: 'M2 8h20M2 16h20', stroke: '#fff', strokeWidth: 0.8, opacity: 0.3 })
    );
  },

  // 📁 Folder — soft blue folder
  folder: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'fold-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#38bdf8' }),
          h('stop', { offset: '100%', stopColor: '#0284c7' })
        )
      ),
      h('path', { d: 'M2 7V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V7z', fill: 'url(#fold-g)', stroke: 'none' })
    );
  },

  // 💰 Money / Budget — green coin
  money: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#16a34a', stroke: 'none' }),
      h('circle', { cx: 12, cy: 12, r: 8, fill: 'none', stroke: '#bbf7d0', strokeWidth: 1, opacity: 0.4 }),
      h('text', { x: 12, y: 16.5, textAnchor: 'middle', fill: '#fff', fontSize: 14, fontWeight: 'bold', fontFamily: 'system-ui' }, '$')
    );
  },

  // 📅 Calendar — red-topped calendar
  calendar: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 3, y: 6, width: 18, height: 16, rx: 2, fill: '#fff', stroke: '#d1d5db', strokeWidth: 1 }),
      h('rect', { x: 3, y: 4, width: 18, height: 5, rx: 2, fill: '#ef4444', stroke: 'none' }),
      h('line', { x1: 8, y1: 2, x2: 8, y2: 6, stroke: '#9ca3af', strokeWidth: 2, strokeLinecap: 'round' }),
      h('line', { x1: 16, y1: 2, x2: 16, y2: 6, stroke: '#9ca3af', strokeWidth: 2, strokeLinecap: 'round' }),
      h('rect', { x: 7, y: 12, width: 3, height: 3, rx: 0.5, fill: '#dbeafe', stroke: 'none' }),
      h('rect', { x: 14, y: 12, width: 3, height: 3, rx: 0.5, fill: '#dbeafe', stroke: 'none' }),
      h('rect', { x: 7, y: 17, width: 3, height: 3, rx: 0.5, fill: '#dbeafe', stroke: 'none' })
    );
  },

  // 🔗 Link / Connection — chain links
  linkChain: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', stroke: '#8b5cf6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' }),
      h('path', { d: 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71', stroke: '#06b6d4', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' })
    );
  },

  // 🔄 Sync / Refresh — spinning arrows
  sync: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M21 2v6h-6', stroke: '#3b82f6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M3 12a9 9 0 0115.36-6.36L21 8', stroke: '#3b82f6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' }),
      h('path', { d: 'M3 22v-6h6', stroke: '#8b5cf6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M21 12a9 9 0 01-15.36 6.36L3 16', stroke: '#8b5cf6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' })
    );
  },

  // 🎯 Target / Goal — red bullseye
  target: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#fee2e2', stroke: '#fca5a5', strokeWidth: 1 }),
      h('circle', { cx: 12, cy: 12, r: 6.5, fill: '#fca5a5', stroke: 'none' }),
      h('circle', { cx: 12, cy: 12, r: 3, fill: '#ef4444', stroke: 'none' })
    );
  },

  // ✨ Sparkle / Magic — gold stars
  sparkle: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z', fill: '#fbbf24', stroke: 'none' }),
      h('circle', { cx: 19, cy: 5, r: 1.5, fill: '#fcd34d', stroke: 'none' }),
      h('circle', { cx: 5, cy: 19, r: 1, fill: '#fcd34d', stroke: 'none' })
    );
  },

  // 📝 Note / Edit — pencil on paper
  note: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 4, y: 2, width: 16, height: 20, rx: 2, fill: '#fef3c7', stroke: '#fbbf24', strokeWidth: 1 }),
      h('line', { x1: 8, y1: 7, x2: 16, y2: 7, stroke: '#d97706', strokeWidth: 1.2, opacity: 0.4, strokeLinecap: 'round' }),
      h('line', { x1: 8, y1: 11, x2: 16, y2: 11, stroke: '#d97706', strokeWidth: 1.2, opacity: 0.4, strokeLinecap: 'round' }),
      h('line', { x1: 8, y1: 15, x2: 13, y2: 15, stroke: '#d97706', strokeWidth: 1.2, opacity: 0.4, strokeLinecap: 'round' }),
      h('path', { d: 'M17 14l3-3 2 2-3 3-2.5.5.5-2.5z', fill: '#f59e0b', stroke: 'none' })
    );
  },

  // 🗑️ Trash — red bin
  trashBin: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M3 6h18', stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
      h('path', { d: 'M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2', stroke: '#ef4444', strokeWidth: 1.5, fill: 'none' }),
      h('path', { d: 'M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14', fill: '#fecaca', stroke: '#ef4444', strokeWidth: 1 }),
      h('line', { x1: 10, y1: 10, x2: 10, y2: 18, stroke: '#ef4444', strokeWidth: 1.2, opacity: 0.5, strokeLinecap: 'round' }),
      h('line', { x1: 14, y1: 10, x2: 14, y2: 18, stroke: '#ef4444', strokeWidth: 1.2, opacity: 0.5, strokeLinecap: 'round' })
    );
  },

  // 💡 Lightbulb / Idea — warm yellow
  idea: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'idea-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#fbbf24' }),
          h('stop', { offset: '100%', stopColor: '#f59e0b' })
        )
      ),
      h('path', { d: 'M9 21h6M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z', fill: 'url(#idea-g)', stroke: 'none' }),
      h('line', { x1: 9, y1: 19, x2: 15, y2: 19, stroke: '#d97706', strokeWidth: 1.5, strokeLinecap: 'round' }),
      h('path', { d: 'M12 6v2', stroke: '#fff', strokeWidth: 1.5, opacity: 0.6, strokeLinecap: 'round' })
    );
  },

  // 🏠 Home — cozy house
  home: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 2L2 10h3v10h6v-6h2v6h6V10h3L12 2z', fill: '#60a5fa', stroke: 'none' }),
      h('rect', { x: 10, y: 14, width: 4, height: 6, fill: '#1e40af', stroke: 'none', opacity: 0.5 })
    );
  },

  // ⏱ Timer / Stopwatch — dynamic timer
  timer: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 13, r: 9, fill: 'none', stroke: '#6366f1', strokeWidth: 2 }),
      h('line', { x1: 12, y1: 13, x2: 12, y2: 8, stroke: '#6366f1', strokeWidth: 2, strokeLinecap: 'round' }),
      h('line', { x1: 12, y1: 13, x2: 15, y2: 15, stroke: '#a78bfa', strokeWidth: 1.5, strokeLinecap: 'round' }),
      h('line', { x1: 10, y1: 2, x2: 14, y2: 2, stroke: '#6366f1', strokeWidth: 2, strokeLinecap: 'round' }),
      h('line', { x1: 19, y1: 5, x2: 21, y2: 3, stroke: '#6366f1', strokeWidth: 2, strokeLinecap: 'round' })
    );
  },

  // ☁️ Cloud — soft cloud
  cloud: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z', fill: '#93c5fd', stroke: 'none' })
    );
  },

  // 🌅 Sunrise — warm horizon
  sunrise: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'rise-g', x1: '0%', y1: '100%', x2: '0%', y2: '0%' },
          h('stop', { offset: '0%', stopColor: '#f97316' }),
          h('stop', { offset: '100%', stopColor: '#fbbf24' })
        )
      ),
      h('rect', { x: 0, y: 16, width: 24, height: 8, fill: '#1e293b', stroke: 'none' }),
      h('circle', { cx: 12, cy: 16, r: 6, fill: 'url(#rise-g)', stroke: 'none' }),
      h('line', { x1: 1, y1: 16, x2: 23, y2: 16, stroke: '#f97316', strokeWidth: 1.5 }),
      h('line', { x1: 12, y1: 6, x2: 12, y2: 3, stroke: '#fbbf24', strokeWidth: 1.5, strokeLinecap: 'round' }),
      h('line', { x1: 5, y1: 10, x2: 3, y2: 8, stroke: '#fbbf24', strokeWidth: 1.5, strokeLinecap: 'round' }),
      h('line', { x1: 19, y1: 10, x2: 21, y2: 8, stroke: '#fbbf24', strokeWidth: 1.5, strokeLinecap: 'round' })
    );
  },

  // ⏳ Hourglass — sand timer
  hourglass: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'hour-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#c084fc' }),
          h('stop', { offset: '100%', stopColor: '#7c3aed' })
        )
      ),
      h('path', { d: 'M6 2h12v4l-4.5 4.5v3L18 18v4H6v-4l4.5-4.5v-3L6 6V2z', fill: 'url(#hour-g)', stroke: 'none' }),
      h('line', { x1: 5, y1: 2, x2: 19, y2: 2, stroke: '#7c3aed', strokeWidth: 2, strokeLinecap: 'round' }),
      h('line', { x1: 5, y1: 22, x2: 19, y2: 22, stroke: '#7c3aed', strokeWidth: 2, strokeLinecap: 'round' }),
      h('path', { d: 'M9 19h6', stroke: '#e9d5ff', strokeWidth: 1.5, strokeLinecap: 'round', opacity: 0.7 })
    );
  },

  // 📦 Package / Box — cardboard brown
  package: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'pkg-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#d97706' }),
          h('stop', { offset: '100%', stopColor: '#92400e' })
        )
      ),
      h('path', { d: 'M12 2L3 7v10l9 5 9-5V7l-9-5z', fill: 'url(#pkg-g)', stroke: 'none' }),
      h('path', { d: 'M3 7l9 5 9-5', stroke: '#fbbf24', strokeWidth: 1.2, fill: 'none', opacity: 0.7 }),
      h('line', { x1: 12, y1: 12, x2: 12, y2: 22, stroke: '#fbbf24', strokeWidth: 1.2, opacity: 0.5 })
    );
  },

  // 📬 Mailbox — open mailbox with flag
  mailbox: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'mbox-g', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#3b82f6' }),
          h('stop', { offset: '100%', stopColor: '#1d4ed8' })
        )
      ),
      h('rect', { x: 3, y: 8, width: 18, height: 12, rx: 3, fill: 'url(#mbox-g)', stroke: 'none' }),
      h('path', { d: 'M3 11a9 9 0 0118 0', fill: 'none', stroke: '#60a5fa', strokeWidth: 1.5 }),
      h('rect', { x: 17, y: 3, width: 3, height: 8, rx: 0.5, fill: '#ef4444', stroke: 'none' }),
      h('rect', { x: 8, y: 13, width: 8, height: 1.5, rx: 0.75, fill: '#bfdbfe', stroke: 'none', opacity: 0.6 })
    );
  },

  // 🦞 Lobster — fun crustacean (used for Chrome browser)
  lobster: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#dc2626', stroke: 'none' }),
      h('circle', { cx: 9, cy: 10, r: 1.5, fill: '#fff', stroke: 'none' }),
      h('circle', { cx: 15, cy: 10, r: 1.5, fill: '#fff', stroke: 'none' }),
      h('path', { d: 'M8 15c2 2 6 2 8 0', stroke: '#fff', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round' }),
      h('path', { d: 'M5 5L3 2M19 5l2-3', stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
      h('circle', { cx: 3, cy: 2, r: 1.5, fill: '#ef4444', stroke: 'none' }),
      h('circle', { cx: 21, cy: 2, r: 1.5, fill: '#ef4444', stroke: 'none' })
    );
  },

  // 🔀 Shuffle / Diff — crossing arrows
  shuffle: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5', stroke: '#8b5cf6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  },

  // 📌 Pin — red pushpin
  pin: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M15 4.5L9.5 10 6 9 3 12l5.5 5.5L12 14l-1-3.5L16.5 5', fill: '#ef4444', stroke: 'none' }),
      h('line', { x1: 3, y1: 21, x2: 8.5, y2: 15.5, stroke: '#6b7280', strokeWidth: 2, strokeLinecap: 'round' }),
      h('path', { d: 'M14 5l5 5-1 1-5-5 1-1z', fill: '#b91c1c', stroke: 'none' })
    );
  },

  // 🏛 Vault / Columns — classical building
  vault: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M2 20h20v2H2z', fill: '#6b7280', stroke: 'none' }),
      h('path', { d: 'M4 20V9h2v11zM10 20V9h2v11zM18 20V9h2v11z', fill: '#9ca3af', stroke: 'none' }),
      h('path', { d: 'M12 2L2 8h20L12 2z', fill: '#64748b', stroke: 'none' }),
      h('rect', { x: 2, y: 8, width: 20, height: 2, fill: '#475569', stroke: 'none' })
    );
  },

  // 📓 Notebook — spiral bound
  notebook: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 5, y: 2, width: 15, height: 20, rx: 2, fill: '#6366f1', stroke: 'none' }),
      h('rect', { x: 8, y: 5, width: 9, height: 1.5, rx: 0.75, fill: '#c7d2fe', stroke: 'none', opacity: 0.6 }),
      h('rect', { x: 8, y: 9, width: 9, height: 1.5, rx: 0.75, fill: '#c7d2fe', stroke: 'none', opacity: 0.6 }),
      h('rect', { x: 8, y: 13, width: 6, height: 1.5, rx: 0.75, fill: '#c7d2fe', stroke: 'none', opacity: 0.4 }),
      h('circle', { cx: 5, cy: 6, r: 1.5, fill: '#e0e7ff', stroke: '#4f46e5', strokeWidth: 1 }),
      h('circle', { cx: 5, cy: 12, r: 1.5, fill: '#e0e7ff', stroke: '#4f46e5', strokeWidth: 1 }),
      h('circle', { cx: 5, cy: 18, r: 1.5, fill: '#e0e7ff', stroke: '#4f46e5', strokeWidth: 1 })
    );
  },

  // 📽 Projector / Presentation — film projector
  projector: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 3, y: 8, width: 18, height: 10, rx: 2, fill: '#475569', stroke: 'none' }),
      h('circle', { cx: 15, cy: 13, r: 4, fill: '#94a3b8', stroke: '#64748b', strokeWidth: 1.5 }),
      h('circle', { cx: 15, cy: 13, r: 1.5, fill: '#3b82f6', stroke: 'none' }),
      h('circle', { cx: 7, cy: 13, r: 2.5, fill: '#94a3b8', stroke: '#64748b', strokeWidth: 1 }),
      h('rect', { x: 5, y: 18, width: 2, height: 3, fill: '#64748b', stroke: 'none' }),
      h('rect', { x: 17, y: 18, width: 2, height: 3, fill: '#64748b', stroke: 'none' }),
      h('rect', { x: 10, y: 4, width: 4, height: 4, rx: 1, fill: '#60a5fa', stroke: 'none' })
    );
  },

  // 📚 Books / Library — stacked books
  books: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 3, y: 4, width: 5, height: 17, rx: 1, fill: '#ef4444', stroke: 'none' }),
      h('rect', { x: 9, y: 2, width: 5, height: 19, rx: 1, fill: '#3b82f6', stroke: 'none' }),
      h('rect', { x: 15, y: 5, width: 5, height: 16, rx: 1, fill: '#22c55e', stroke: 'none' }),
      h('rect', { x: 4, y: 7, width: 3, height: 1, rx: 0.5, fill: '#fca5a5', stroke: 'none', opacity: 0.6 }),
      h('rect', { x: 10, y: 5, width: 3, height: 1, rx: 0.5, fill: '#93c5fd', stroke: 'none', opacity: 0.6 }),
      h('rect', { x: 16, y: 8, width: 3, height: 1, rx: 0.5, fill: '#86efac', stroke: 'none', opacity: 0.6 })
    );
  },

  // 💜 Purple Heart / Teams
  heart: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'heart-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#c084fc' }),
          h('stop', { offset: '100%', stopColor: '#7c3aed' })
        )
      ),
      h('path', { d: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z', fill: 'url(#heart-g)', stroke: 'none' })
    );
  },

  // ❤ Red Heart
  redHeart: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z', fill: '#ef4444', stroke: 'none' })
    );
  },

  // 🖊 Pen / Whiteboard
  pen: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'pen-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#6366f1' }),
          h('stop', { offset: '100%', stopColor: '#4338ca' })
        )
      ),
      h('path', { d: 'M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z', fill: 'url(#pen-g)', stroke: 'none' }),
      h('path', { d: 'M15 5l4 4', stroke: '#c7d2fe', strokeWidth: 1, opacity: 0.5 })
    );
  },

  // 🔵 Blue circle (generic)
  blueCircle: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#3b82f6', stroke: 'none' })
    );
  },

  // 🔷 Blue diamond
  blueDiamond: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 2l10 10-10 10L2 12 12 2z', fill: '#60a5fa', stroke: 'none' })
    );
  },

  // ⛅ Partly cloudy
  partlyCloudy: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 8, cy: 10, r: 5, fill: '#fbbf24', stroke: 'none' }),
      h('path', { d: 'M16 14h-1a6 6 0 00-11.5 0H3a4 4 0 000 8h13a4 4 0 000-8z', fill: '#94a3b8', stroke: 'none' })
    );
  },

  // 🌤 Sun behind cloud
  sunCloud: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 10, cy: 8, r: 5, fill: '#fbbf24', stroke: 'none' }),
      h('line', { x1: 10, y1: 1, x2: 10, y2: 3, stroke: '#fbbf24', strokeWidth: 1.5, strokeLinecap: 'round' }),
      h('line', { x1: 3, y1: 8, x2: 5, y2: 8, stroke: '#fbbf24', strokeWidth: 1.5, strokeLinecap: 'round' }),
      h('path', { d: 'M18 14h-1a6 6 0 00-11 0H5a3.5 3.5 0 000 7h13a3.5 3.5 0 000-7z', fill: '#e2e8f0', stroke: 'none' })
    );
  },

  // 🟠 Orange circle
  orangeCircle: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: '#f97316', stroke: 'none' })
    );
  },

  // 🏗 Construction / Building
  construction: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M2 20h20', stroke: '#64748b', strokeWidth: 2, strokeLinecap: 'round' }),
      h('path', { d: 'M5 20V10l7-6 7 6v10', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 }),
      h('rect', { x: 9, y: 13, width: 6, height: 7, fill: '#fbbf24', stroke: 'none', opacity: 0.4 }),
      h('path', { d: 'M2 8l4-3M22 8l-4-3', stroke: '#f59e0b', strokeWidth: 2, strokeLinecap: 'round' })
    );
  },

  // 🚫 Blocked / No entry — red circle with line
  blocked: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 10, fill: 'none', stroke: '#ef4444', strokeWidth: 2.5 }),
      h('line', { x1: 5, y1: 19, x2: 19, y2: 5, stroke: '#ef4444', strokeWidth: 2.5 })
    );
  },

  // 👍 Thumbs up
  thumbsUp: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3', fill: '#60a5fa', stroke: 'none' }),
      h('path', { d: 'M7 11V3.5A1.5 1.5 0 018.5 2c.83 0 1.5.67 1.5 1.5V11h5.17a2 2 0 012 1.7l.83 6a2 2 0 01-2 2.3H7', fill: '#93c5fd', stroke: 'none' })
    );
  },

  // ▲ Triangle up
  triangleUp: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 5l8 14H4l8-14z', fill: '#64748b', stroke: 'none' })
    );
  },

  // ▼ Triangle down
  triangleDown: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M12 19L4 5h16l-8 14z', fill: '#64748b', stroke: 'none' })
    );
  },

  // ⚙ Gear (alias for settings contexts)
  settings: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'set-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#64748b' }),
          h('stop', { offset: '100%', stopColor: '#475569' })
        )
      ),
      h('circle', { cx: 12, cy: 12, r: 3.5, fill: '#334155', stroke: 'none' }),
      h('path', { d: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z', fill: 'url(#set-g)', stroke: 'none' })
    );
  },

  // 🎥 Video / Camera — red record
  video: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 2, y: 6, width: 14, height: 12, rx: 2, fill: '#475569', stroke: 'none' }),
      h('polygon', { points: '22 7 16 12 22 17', fill: '#ef4444', stroke: 'none' }),
      h('circle', { cx: 5, cy: 9, r: 1.5, fill: '#ef4444', stroke: 'none' })
    );
  },

  // 🗄️ Database / Storage
  database: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('ellipse', { cx: 12, cy: 5, rx: 9, ry: 3, fill: '#6366f1', stroke: 'none' }),
      h('path', { d: 'M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5', fill: '#818cf8', stroke: 'none' }),
      h('path', { d: 'M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6', fill: '#a5b4fc', stroke: 'none' }),
      h('ellipse', { cx: 12, cy: 11, rx: 9, ry: 3, fill: 'none', stroke: '#4f46e5', strokeWidth: 0.5, opacity: 0.5 })
    );
  },

  // 🗺️ Map
  map: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z', fill: '#86efac', stroke: 'none' }),
      h('path', { d: 'M8 2v16', stroke: '#22c55e', strokeWidth: 1.5 }),
      h('path', { d: 'M16 6v16', stroke: '#22c55e', strokeWidth: 1.5 }),
      h('circle', { cx: 12, cy: 10, r: 2, fill: '#ef4444', stroke: 'none' })
    );
  },

  // ↔️ Bidirectional / Sync
  biDirectional: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('line', { x1: 4, y1: 12, x2: 20, y2: 12, stroke: '#6366f1', strokeWidth: 2.5, strokeLinecap: 'round' }),
      h('polyline', { points: '8 8 4 12 8 16', stroke: '#6366f1', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('polyline', { points: '16 8 20 12 16 16', stroke: '#6366f1', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  },

  // 💻 Computer / Desktop
  computer: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2, fill: '#334155', stroke: 'none' }),
      h('rect', { x: 4, y: 5, width: 16, height: 10, rx: 1, fill: '#60a5fa', stroke: 'none', opacity: 0.3 }),
      h('line', { x1: 8, y1: 21, x2: 16, y2: 21, stroke: '#64748b', strokeWidth: 2, strokeLinecap: 'round' }),
      h('line', { x1: 12, y1: 17, x2: 12, y2: 21, stroke: '#64748b', strokeWidth: 2 })
    );
  },

  // ❌ Cross / Error (standalone, no circle)
  cross: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M18 6L6 18M6 6l12 12', stroke: '#ef4444', strokeWidth: 3, strokeLinecap: 'round' })
    );
  },

  // 🔑 Key (duplicate-safe alias for server-side usage)
  apiKey: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('defs', null,
        h('linearGradient', { id: 'akey-g', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#fbbf24' }),
          h('stop', { offset: '100%', stopColor: '#f59e0b' })
        )
      ),
      h('circle', { cx: 8, cy: 15, r: 5, fill: 'url(#akey-g)', stroke: 'none' }),
      h('circle', { cx: 8, cy: 15, r: 2, fill: '#78350f', stroke: 'none', opacity: 0.3 }),
      h('rect', { x: 12, y: 8, width: 9, height: 3.5, rx: 1, fill: 'url(#akey-g)', stroke: 'none', transform: 'rotate(-45 12 10)' }),
      h('rect', { x: 17, y: 5, width: 2, height: 4, rx: 0.5, fill: '#d97706', stroke: 'none', transform: 'rotate(-45 18 7)' })
    );
  },

  // 👁 Eye / Observer
  eye: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', fill: '#dbeafe', stroke: '#3b82f6', strokeWidth: 1.5 }),
      h('circle', { cx: 12, cy: 12, r: 3.5, fill: '#3b82f6', stroke: 'none' }),
      h('circle', { cx: 12, cy: 12, r: 1.5, fill: '#1e3a8a', stroke: 'none' })
    );
  },

  // 🔗 Link (alias)
  link: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('path', { d: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', stroke: '#8b5cf6', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' }),
      h('path', { d: 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71', stroke: '#06b6d4', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' })
    );
  },
  whatsapp: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 11, fill: '#25D366' }),
      h('path', { d: 'M17.47 14.38c-.27-.14-1.6-.79-1.85-.88s-.43-.14-.61.14-.7.88-.86 1.06-.32.2-.59.07a7.4 7.4 0 01-2.2-1.36 8.3 8.3 0 01-1.52-1.9c-.16-.27 0-.42.12-.56s.27-.32.41-.48.18-.27.27-.45a.5.5 0 000-.48c-.07-.14-.61-1.47-.84-2-.22-.53-.44-.46-.61-.46h-.52a1 1 0 00-.72.34A3.04 3.04 0 007.2 10a5.27 5.27 0 001.1 2.8 12.1 12.1 0 004.63 4.09c.65.28 1.15.45 1.55.58.65.21 1.24.18 1.71.11.52-.08 1.6-.66 1.83-1.29s.23-1.18.16-1.29-.25-.2-.52-.34z', fill: 'white' })
    );
  },
  telegram: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('circle', { cx: 12, cy: 12, r: 11, fill: '#0088cc' }),
      h('path', { d: 'M5.4 11.6l11.2-4.3c.5-.2.9.1.8.7l-1.9 9c-.1.6-.5.7-.9.5l-2.8-2.1-1.3 1.3c-.2.2-.3.2-.5.1l.2-3.1 5.6-5.1c.2-.2 0-.3-.3-.1l-7 4.4-3-1c-.6-.2-.6-.6.1-.9z', fill: 'white' })
    );
  },
  terminal: function(size) {
    var s = size || 20;
    return h('svg', svg({ width: s, height: s }),
      h('rect', { x: 2, y: 3, width: 20, height: 18, rx: 3, fill: '#1e1e1e' }),
      h('path', { d: 'M6 8l4 4-4 4', stroke: '#4ade80', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('line', { x1: 12, y1: 16, x2: 18, y2: 16, stroke: '#4ade80', strokeWidth: 2, strokeLinecap: 'round' })
    );
  },
};
