import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-contacts',
  name: 'Google Contacts',
  description: 'Contact search, directory lookup, create and update contacts.',
  category: 'productivity',
  risk: 'medium',
  icon: Emoji.people,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_contacts_list', name: 'List Contacts', description: 'List contacts', category: 'read', risk: 'low', skillId: 'gws-contacts', sideEffects: [] },
  { id: 'google_contacts_search', name: 'Search Contacts', description: 'Search contacts by name/email', category: 'read', risk: 'low', skillId: 'gws-contacts', sideEffects: [] },
  { id: 'google_contacts_search_directory', name: 'Search Directory', description: 'Search organization directory', category: 'read', risk: 'low', skillId: 'gws-contacts', sideEffects: [] },
  { id: 'google_contacts_create', name: 'Create Contact', description: 'Create a new contact', category: 'write', risk: 'medium', skillId: 'gws-contacts', sideEffects: [] },
  { id: 'google_contacts_update', name: 'Update Contact', description: 'Update an existing contact', category: 'write', risk: 'medium', skillId: 'gws-contacts', sideEffects: [] },
];
