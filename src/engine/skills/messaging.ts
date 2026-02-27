import type { SkillDefinition, ToolDefinition } from '../skills.js';

const WHATSAPP_SKILL_DEF: SkillDefinition = {
  id: 'msg-whatsapp',
  name: 'WhatsApp',
  description: 'WhatsApp messaging via linked device.',
  category: 'messaging',
};

const WHATSAPP_TOOLS: ToolDefinition[] = [
  { id: 'whatsapp_connect', name: 'Connect WhatsApp', description: 'Start connection, get QR code', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: [] },
  { id: 'whatsapp_status', name: 'WhatsApp Status', description: 'Check connection status', category: 'read', risk: 'low', skillId: 'msg-whatsapp', sideEffects: [] },
  { id: 'whatsapp_send', name: 'Send WhatsApp', description: 'Send a text message', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_send_media', name: 'Send WhatsApp Media', description: 'Send image/video/document', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_get_groups', name: 'List WhatsApp Groups', description: 'List joined groups', category: 'read', risk: 'low', skillId: 'msg-whatsapp', sideEffects: [] },
  { id: 'whatsapp_send_voice', name: 'Send Voice Note', description: 'Send audio voice note', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_send_location', name: 'Send Location', description: 'Send a location pin', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_send_contact', name: 'Send Contact', description: 'Share a contact card', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_react', name: 'React to Message', description: 'Add emoji reaction', category: 'write', risk: 'low', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_typing', name: 'Typing Indicator', description: 'Show typing status', category: 'write', risk: 'low', skillId: 'msg-whatsapp', sideEffects: [] },
  { id: 'whatsapp_read_receipts', name: 'Read Receipts', description: 'Mark messages as read', category: 'write', risk: 'low', skillId: 'msg-whatsapp', sideEffects: [] },
  { id: 'whatsapp_profile', name: 'WhatsApp Profile', description: 'Get profile info', category: 'read', risk: 'low', skillId: 'msg-whatsapp', sideEffects: [] },
  { id: 'whatsapp_group_manage', name: 'Manage Group', description: 'Create/update/leave groups', category: 'write', risk: 'high', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_delete_message', name: 'Delete Message', description: 'Delete a sent message', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_forward', name: 'Forward Message', description: 'Forward a message', category: 'write', risk: 'medium', skillId: 'msg-whatsapp', sideEffects: ['sends-message'] },
  { id: 'whatsapp_disconnect', name: 'Disconnect WhatsApp', description: 'Disconnect session', category: 'write', risk: 'low', skillId: 'msg-whatsapp', sideEffects: [] },
];

const TELEGRAM_SKILL_DEF: SkillDefinition = {
  id: 'msg-telegram',
  name: 'Telegram',
  description: 'Telegram Bot API messaging.',
  category: 'messaging',
};

const TELEGRAM_TOOLS: ToolDefinition[] = [
  { id: 'telegram_send', name: 'Send Telegram', description: 'Send a text message', category: 'write', risk: 'medium', skillId: 'msg-telegram', sideEffects: ['sends-message'] },
  { id: 'telegram_send_media', name: 'Send Telegram Media', description: 'Send photo/video/document', category: 'write', risk: 'medium', skillId: 'msg-telegram', sideEffects: ['sends-message'] },
  { id: 'telegram_get_me', name: 'Telegram Bot Info', description: 'Get bot info', category: 'read', risk: 'low', skillId: 'msg-telegram', sideEffects: [] },
  { id: 'telegram_get_chat', name: 'Telegram Chat Info', description: 'Get chat details', category: 'read', risk: 'low', skillId: 'msg-telegram', sideEffects: [] },
];

export const MESSAGING_SKILLS: SkillDefinition[] = [
  { ...WHATSAPP_SKILL_DEF, tools: WHATSAPP_TOOLS },
  { ...TELEGRAM_SKILL_DEF, tools: TELEGRAM_TOOLS },
];
