import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-forms',
  name: 'Google Forms',
  description: 'Create forms, add questions, and read responses.',
  category: 'productivity',
  risk: 'low',
  icon: Emoji.clipboard,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_forms_create', name: 'Create Form', description: 'Create Google Form', category: 'write', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_get', name: 'Get Form', description: 'Get form details', category: 'read', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_add_question', name: 'Add Question', description: 'Add question to a form', category: 'write', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_update_info', name: 'Update Info', description: 'Update form title/description', category: 'write', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_delete_item', name: 'Delete Item', description: 'Delete a form item', category: 'destroy', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_list_responses', name: 'List Responses', description: 'List form responses', category: 'read', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_get_response', name: 'Get Response', description: 'Get a single response', category: 'read', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
  { id: 'google_forms_publish_settings', name: 'Publish Settings', description: 'Update form publish settings', category: 'write', risk: 'low', skillId: 'gws-forms', sideEffects: [] },
];
