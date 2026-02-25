import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-slides',
  name: 'Google Slides',
  description: 'Create and edit presentations.',
  category: 'productivity',
  risk: 'low',
  icon: '🎨',
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_slides_create', name: 'Create Presentation', description: 'Create Google Slides presentation', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_get', name: 'Get Presentation', description: 'Get presentation metadata', category: 'read', risk: 'low', skillId: 'gws-slides', sideEffects: [] },
  { id: 'google_slides_get_page', name: 'Get Page', description: 'Get slide page details', category: 'read', risk: 'low', skillId: 'gws-slides', sideEffects: [] },
  { id: 'google_slides_thumbnail', name: 'Thumbnail', description: 'Get slide thumbnail image', category: 'read', risk: 'low', skillId: 'gws-slides', sideEffects: [] },
  { id: 'google_slides_add_slide', name: 'Add Slide', description: 'Add a new slide', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_insert_text', name: 'Insert Text', description: 'Insert text into a shape', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_replace_text', name: 'Replace Text', description: 'Find and replace text', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_create_textbox', name: 'Create Textbox', description: 'Create a text box on a slide', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_add_image', name: 'Add Image', description: 'Add image to a slide', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_delete_slide', name: 'Delete Slide', description: 'Delete a slide', category: 'destroy', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_duplicate_slide', name: 'Duplicate Slide', description: 'Duplicate a slide', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
  { id: 'google_slides_batch_update', name: 'Batch Update', description: 'Apply multiple updates at once', category: 'write', risk: 'low', skillId: 'gws-slides', sideEffects: ['modifies-files'] },
];
