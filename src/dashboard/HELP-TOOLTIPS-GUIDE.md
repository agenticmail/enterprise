# Help Tooltips Implementation Guide

## Pattern
Use the existing `HelpButton` component from `../components/help-button.js` (or `../../components/help-button.js` for agent-detail).

### Import
```js
import { HelpButton } from '../components/help-button.js';
```

### Usage
Add HelpButton next to section titles, card headers, stat labels, and tab headers:
```js
h('h3', { style: { display: 'flex', alignItems: 'center' } }, 
  'Section Title',
  h(HelpButton, { label: 'Section Title' },
    h('p', null, 'Main explanation of what this section does.'),
    h('h4', { style: _h4 }, 'Key Concepts'),
    h('ul', { style: _ul },
      h('li', null, 'Concept 1 explanation'),
      h('li', null, 'Concept 2 explanation'),
    ),
    h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Helpful tip here.')
  )
)
```

### Style Variables (define at top of render function)
```js
var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };
```

## Rules
1. Add HelpButton to EVERY card header, section title, and stat label
2. Keep help text concise but useful — explain what it is, why it matters, and how to use it
3. Include "Tip:" boxes for actionable advice
4. Use h4 for sub-headings within help modals
5. Use ul/li for lists of concepts
6. Don't repeat obvious UI labels — explain the WHY
7. Reference the existing knowledge-contributions.js page for the gold standard example
8. Make sure to import HelpButton at the top of each file
9. DO NOT change any existing functionality — only ADD help tooltips
10. Test that the file is valid JS after changes (no syntax errors)
