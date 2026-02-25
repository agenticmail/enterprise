import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-chat',
  name: 'Google Chat',
  description: 'Messaging, spaces, threads, members, and reactions.',
  category: 'collaboration',
  risk: 'medium',
  icon: Emoji.chat,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_chat_setup_space', name: 'Setup Space', description: 'Create a Chat space or DM', category: 'write', risk: 'medium', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_find_dm', name: 'Find DM', description: 'Find existing DM with a user', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_list_spaces', name: 'List Spaces', description: 'List Chat spaces', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_get_space', name: 'Get Space', description: 'Get space details', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_list_messages', name: 'List Messages', description: 'List messages in a space', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_send_message', name: 'Send Message', description: 'Send a Chat message', category: 'communicate', risk: 'medium', skillId: 'gws-chat', sideEffects: ['sends-message'] },
  { id: 'google_chat_update_message', name: 'Update Message', description: 'Edit a Chat message', category: 'write', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_delete_message', name: 'Delete Message', description: 'Delete a Chat message', category: 'destroy', risk: 'medium', skillId: 'gws-chat', sideEffects: ['deletes-data'] },
  { id: 'google_chat_list_members', name: 'List Members', description: 'List space members', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_add_member', name: 'Add Member', description: 'Add member to space', category: 'write', risk: 'medium', skillId: 'gws-chat', sideEffects: [] },
  { id: 'google_chat_upload_attachment', name: 'Upload Attachment', description: 'Upload file/image and send as message attachment (up to 200MB)', category: 'communicate', risk: 'medium', skillId: 'gws-chat', sideEffects: ['sends-message', 'uploads-file'] },
  { id: 'google_chat_send_image', name: 'Send Image', description: 'Send inline image from URL using Card widget (no upload needed)', category: 'communicate', risk: 'medium', skillId: 'gws-chat', sideEffects: ['sends-message'] },
  { id: 'google_chat_download_attachment', name: 'Download Attachment', description: 'Download file attachment from a Chat message', category: 'read', risk: 'low', skillId: 'gws-chat', sideEffects: ['writes-file'] },
  { id: 'google_chat_react', name: 'React', description: 'Add reaction to a message', category: 'write', risk: 'low', skillId: 'gws-chat', sideEffects: [] },
];
