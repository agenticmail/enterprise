/**
 * provider-logos.js — Proper multi-color brand logos for Google, Microsoft, and related services.
 * Import and use: `import { ProviderLogo } from '../assets/provider-logos.js'`
 *
 * Usage: ProviderLogo.google(size)  — multi-color "G" logo
 *        ProviderLogo.microsoft(size) — 4-square Windows logo
 *        ProviderLogo.googleMeet(size), .teams(size), .zoom(size)
 *        ProviderLogo.googleDrive(size), .googleSites(size)
 *        ProviderLogo.sharepoint(size), .onedrive(size)
 *        ProviderLogo.confluence(size), .notion(size)
 */
import { h } from '../components/utils.js';

function sv(s) { return { viewBox: '0 0 24 24', width: s, height: s, fill: 'none' }; }

export var ProviderLogo = {

  /** Google — official multi-color "G" */
  google: function(size) {
    var s = size || 28;
    return h('svg', sv(s),
      h('path', { d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z', fill: '#4285F4' }),
      h('path', { d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z', fill: '#34A853' }),
      h('path', { d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z', fill: '#FBBC05' }),
      h('path', { d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z', fill: '#EA4335' })
    );
  },

  /** Microsoft — 4-square Windows logo */
  microsoft: function(size) {
    var s = size || 28;
    return h('svg', sv(s),
      h('rect', { x: 1, y: 1, width: 10.5, height: 10.5, fill: '#F25022' }),
      h('rect', { x: 12.5, y: 1, width: 10.5, height: 10.5, fill: '#7FBA00' }),
      h('rect', { x: 1, y: 12.5, width: 10.5, height: 10.5, fill: '#00A4EF' }),
      h('rect', { x: 12.5, y: 12.5, width: 10.5, height: 10.5, fill: '#FFB900' })
    );
  },

  /** Google Meet — green camera icon */
  googleMeet: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24' }),
      h('path', { d: 'M14 12l5.24-3.66A.99.99 0 0121 9.15v5.7a.99.99 0 01-1.76.81L14 12z', fill: '#00832D' }),
      h('rect', { x: 3, y: 6, width: 12, height: 12, rx: 2, fill: '#00AC47' }),
      h('path', { d: 'M7 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z', fill: '#fff' })
    );
  },

  /** Microsoft Teams — purple icon */
  teams: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24' }),
      h('circle', { cx: 17.5, cy: 6.5, r: 2.5, fill: '#5059C9' }),
      h('path', { d: 'M20 10h-5a1 1 0 00-1 1v5a3 3 0 006 0v-5a1 1 0 00-1-1z', fill: '#5059C9', opacity: 0.8 }),
      h('circle', { cx: 10, cy: 5.5, r: 3, fill: '#7B83EB' }),
      h('path', { d: 'M15 10H5a1 1 0 00-1 1v5.5A4.5 4.5 0 008.5 21h3a4.5 4.5 0 004.5-4.5V11a1 1 0 00-1-1z', fill: '#7B83EB' })
    );
  },

  /** Zoom — blue camera */
  zoom: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24' }),
      h('rect', { x: 1, y: 4, width: 22, height: 16, rx: 4, fill: '#2D8CFF' }),
      h('path', { d: 'M6 9h6a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 012-2z', fill: '#fff' }),
      h('path', { d: 'M15 10.5l4-2.5v8l-4-2.5v-3z', fill: '#fff' })
    );
  },

  /** Google Drive — triangle logo */
  googleDrive: function(size) {
    var s = size || 28;
    return h('svg', sv(s),
      h('path', { d: 'M7.71 3.5L1.15 15l3.43 5.96h6.56L4.57 9.46z', fill: '#0066DA' }),
      h('path', { d: 'M16.29 3.5H7.71l6.57 11.5h8.57z', fill: '#00AC47' }),
      h('path', { d: 'M22.85 15H14.28l-3.42 5.96h8.56z', fill: '#EA4335' }),
      h('path', { d: 'M7.71 3.5l-3.14 5.96L14.28 15l3.43-5.96z', fill: '#00832D', opacity: 0.5 })
    );
  },

  /** Google Sites — blue page icon */
  googleSites: function(size) {
    var s = size || 28;
    return h('svg', sv(s),
      h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3, fill: '#4285F4' }),
      h('rect', { x: 6, y: 7, width: 12, height: 2, rx: 1, fill: '#fff' }),
      h('rect', { x: 6, y: 11, width: 8, height: 2, rx: 1, fill: '#fff', opacity: 0.7 }),
      h('rect', { x: 6, y: 15, width: 10, height: 2, rx: 1, fill: '#fff', opacity: 0.5 })
    );
  },

  /** SharePoint — teal S */
  sharepoint: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24' }),
      h('circle', { cx: 12, cy: 8, r: 6, fill: '#038387' }),
      h('circle', { cx: 7.5, cy: 14, r: 5, fill: '#03787C' }),
      h('circle', { cx: 11, cy: 19, r: 4, fill: '#026D6E' }),
      h('text', { x: 9, y: 11, fontSize: 9, fontWeight: 700, fill: '#fff', fontFamily: 'Arial,sans-serif' }, 'S')
    );
  },

  /** OneDrive — blue cloud */
  onedrive: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24' }),
      h('path', { d: 'M19.35 10.04A7.49 7.49 0 0012 4a7.48 7.48 0 00-6.92 4.63A6 6 0 006 20h13a5 5 0 00.35-9.96z', fill: '#0078D4' }),
      h('path', { d: 'M6 20a6 6 0 01-.46-11.37A7.48 7.48 0 0112 4a7.44 7.44 0 015 1.94A5.5 5.5 0 0110.5 20H6z', fill: '#0364B8' })
    );
  },

  /** Confluence — blue wiki icon */
  confluence: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24', fill: '#0052CC' }),
      h('path', { d: 'M2.64 18.1c-.24.38-.5.82-.74 1.18a.57.57 0 00.18.78l3.2 1.97a.57.57 0 00.78-.18c.2-.33.46-.76.74-1.24 2.1-3.56 4.18-3.13 8.02-1.27l3.24 1.57a.57.57 0 00.76-.27l1.56-3.36a.57.57 0 00-.27-.76C16.2 14.55 8.22 10.63 2.64 18.1z' }),
      h('path', { d: 'M21.36 5.9c.24-.38.5-.82.74-1.18a.57.57 0 00-.18-.78L18.72 2a.57.57 0 00-.78.18c-.2.33-.46.76-.74 1.24-2.1 3.56-4.18 3.13-8.02 1.27L5.94 3.12a.57.57 0 00-.76.27L3.62 6.75a.57.57 0 00.27.76C7.8 9.45 15.78 13.37 21.36 5.9z' })
    );
  },

  /** Notion — black/white N */
  notion: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24' }),
      h('rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', opacity: 0.1 }),
      h('rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
      h('text', { x: 8.5, y: 17, fontSize: 14, fontWeight: 700, fill: 'currentColor', fontFamily: 'Georgia,serif' }, 'N')
    );
  },

  /** GitHub — octocat silhouette */
  github: function(size) {
    var s = size || 28;
    return h('svg', Object.assign(sv(s), { viewBox: '0 0 24 24', fill: 'currentColor' }),
      h('path', { d: 'M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.607.069-.607 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z' })
    );
  }
};
