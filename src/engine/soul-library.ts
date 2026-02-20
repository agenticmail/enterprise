// soul-library.ts — Pre-built SOUL.md/identity templates for enterprise AI agent roles
// Templates are stored in soul-templates.json and loaded at runtime.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export type SoulCategory =
  | 'support'
  | 'sales'
  | 'engineering'
  | 'operations'
  | 'hr'
  | 'finance'
  | 'marketing'
  | 'legal'
  | 'research'
  | 'creative'
  | 'executive'
  | 'data'
  | 'security'
  | 'education';

export interface SoulTemplate {
  id: string;
  name: string;
  category: SoulCategory;
  description: string;
  personality: string;
  identity: {
    role: string;
    tone: 'formal' | 'casual' | 'professional' | 'friendly';
    language: string;
  };
  suggestedSkills: string[];
  suggestedPreset: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Load templates from JSON at runtime (lazy, cached)
// ---------------------------------------------------------------------------

let _loaded = false;
let _categories: Record<SoulCategory, { name: string; description: string; icon: string }> = {} as any;
let _templates: SoulTemplate[] = [];

function ensureLoaded(): void {
  if (_loaded) return;
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, 'soul-templates.json'), 'utf-8');
    const data = JSON.parse(raw);
    _categories = data.categories || {};
    _templates = data.templates || [];
  } catch {
    // Fallback: try relative to dist (npm package layout)
    try {
      const raw = readFileSync(join(process.cwd(), 'node_modules', '@agenticmail', 'enterprise', 'dist', 'soul-templates.json'), 'utf-8');
      const data = JSON.parse(raw);
      _categories = data.categories || {};
      _templates = data.templates || [];
    } catch {
      _categories = {} as any;
      _templates = [];
    }
  }
  _loaded = true;
}

export function SOUL_CATEGORIES_GETTER(): Record<SoulCategory, { name: string; description: string; icon: string }> {
  ensureLoaded();
  return _categories;
}

// Re-export as a getter-backed constant for backwards compatibility
export const SOUL_CATEGORIES = new Proxy({} as Record<SoulCategory, { name: string; description: string; icon: string }>, {
  get(_target, prop, receiver) {
    ensureLoaded();
    return Reflect.get(_categories, prop, receiver);
  },
  ownKeys() {
    ensureLoaded();
    return Reflect.ownKeys(_categories);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureLoaded();
    const desc = Object.getOwnPropertyDescriptor(_categories, prop);
    if (desc) desc.configurable = true;
    return desc;
  },
  has(_target, prop) {
    ensureLoaded();
    return prop in _categories;
  },
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Returns all soul templates. */
export function getSoulTemplates(): SoulTemplate[] {
  ensureLoaded();
  return _templates;
}

/** Returns templates grouped by category. */
export function getSoulTemplatesByCategory(): Record<SoulCategory, SoulTemplate[]> {
  ensureLoaded();
  const grouped = {} as Record<SoulCategory, SoulTemplate[]>;
  for (const cat of Object.keys(_categories) as SoulCategory[]) {
    grouped[cat] = [];
  }
  for (const tpl of _templates) {
    if (grouped[tpl.category]) {
      grouped[tpl.category].push(tpl);
    }
  }
  return grouped;
}

/** Returns a single template by ID, or undefined if not found. */
export function getSoulTemplate(id: string): SoulTemplate | undefined {
  ensureLoaded();
  return _templates.find((t) => t.id === id);
}

/** Searches templates by name, description, and tags. Case-insensitive. */
export function searchSoulTemplates(query: string): SoulTemplate[] {
  ensureLoaded();
  const q = query.toLowerCase().trim();
  if (!q) return _templates;
  return _templates.filter((t) => {
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q)
    );
  });
}
