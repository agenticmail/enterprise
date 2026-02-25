/**
 * Page Action Extractor — injectable script that discovers all interactable elements.
 * 
 * Ported from agentralabs/agentic-vision extractors/core/actions.ts.
 * Injected into browser pages via Playwright evaluate() to build an action map.
 * Returns structured data about buttons, links, inputs, selects — with risk classification.
 */

/**
 * Script to inject into browser page via evaluate().
 * Returns JSON array of discovered page actions.
 */
export const PAGE_EXTRACTOR_SCRIPT = `
(function() {
  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (parseFloat(style.opacity) === 0) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.getAttribute('aria-label')) return '[aria-label="' + el.getAttribute('aria-label') + '"]';
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    // Generate a path-based selector
    var path = [];
    var current = el;
    while (current && current !== document.body) {
      var tag = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          tag += ':nth-of-type(' + idx + ')';
        }
      }
      path.unshift(tag);
      current = parent;
    }
    return path.join(' > ');
  }

  function classifyRisk(text, el) {
    text = (text || '').toLowerCase();
    if (text.includes('delete') || text.includes('remove') || text.includes('destroy')) return 'destructive';
    if (text.includes('buy') || text.includes('purchase') || text.includes('submit') || text.includes('send')) return 'caution';
    if (text.includes('sign out') || text.includes('log out') || text.includes('disconnect')) return 'caution';
    if (el && el.getAttribute('type') === 'submit') return 'caution';
    return 'safe';
  }

  function getBBox(el) {
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  var actions = [];

  // Buttons
  document.querySelectorAll("button, [role='button'], input[type='submit'], input[type='button']").forEach(function(el) {
    var text = (el.textContent || el.getAttribute('value') || '').trim();
    if (!text || text.length > 100) text = el.getAttribute('aria-label') || 'button';
    actions.push({
      type: 'button', label: text.substring(0, 80), selector: getSelector(el),
      risk: classifyRisk(text, el), visible: isVisible(el), bbox: getBBox(el)
    });
  });

  // Navigation links (skip anchors and javascript:void)
  document.querySelectorAll('a[href]').forEach(function(el) {
    var href = el.getAttribute('href') || '';
    if (href === '#' || href === 'javascript:void(0)') return;
    var text = (el.textContent || '').trim();
    if (!text || text.length > 100) text = el.getAttribute('aria-label') || href.substring(0, 50);
    if (!isVisible(el)) return;
    actions.push({
      type: 'link', label: text.substring(0, 80), selector: getSelector(el),
      risk: 'safe', visible: true, bbox: getBBox(el)
    });
  });

  // Text inputs
  document.querySelectorAll("input[type='text'], input[type='email'], input[type='search'], input[type='password'], input[type='tel'], input[type='url'], input[type='number'], textarea").forEach(function(el) {
    var name = el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('id') || 'field';
    actions.push({
      type: 'input', label: name.substring(0, 80), selector: getSelector(el),
      risk: 'safe', visible: isVisible(el), bbox: getBBox(el)
    });
  });

  // Selects
  document.querySelectorAll('select').forEach(function(el) {
    var name = el.getAttribute('name') || el.getAttribute('id') || 'select';
    actions.push({
      type: 'select', label: name.substring(0, 80), selector: getSelector(el),
      risk: 'safe', visible: isVisible(el), bbox: getBBox(el)
    });
  });

  // Checkboxes & radios
  document.querySelectorAll("input[type='checkbox'], input[type='radio']").forEach(function(el) {
    var label = '';
    if (el.id) { var lbl = document.querySelector('label[for="' + el.id + '"]'); if (lbl) label = lbl.textContent; }
    if (!label) label = el.getAttribute('name') || 'checkbox';
    actions.push({
      type: 'checkbox', label: label.trim().substring(0, 80), selector: getSelector(el),
      risk: 'safe', visible: isVisible(el), bbox: getBBox(el)
    });
  });

  // Only return visible actions, limit to top 100
  return actions.filter(function(a) { return a.visible; }).slice(0, 100);
})()
`;

/**
 * Script to extract page metadata quickly.
 */
export const PAGE_META_SCRIPT = `
(function() {
  return {
    title: document.title || '',
    url: location.href,
    description: (document.querySelector('meta[name="description"]') || {}).content || '',
    h1: (document.querySelector('h1') || {}).textContent || '',
    formCount: document.querySelectorAll('form').length,
    inputCount: document.querySelectorAll('input, textarea, select').length,
    linkCount: document.querySelectorAll('a[href]').length,
    buttonCount: document.querySelectorAll('button, [role="button"]').length,
    hasLogin: !!(document.querySelector('input[type="password"]')),
    hasSearch: !!(document.querySelector('input[type="search"], [role="search"]')),
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  };
})()
`;
