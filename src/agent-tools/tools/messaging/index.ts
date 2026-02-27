/**
 * Messaging Tools — barrel export.
 * WhatsApp (QR-linked device), Telegram (Bot API).
 */
export { createTelegramTools, pollTelegramUpdates, setTelegramWebhook, deleteTelegramWebhook, getTelegramWebhookInfo } from './telegram.js';
export { createWhatsAppTools, getWhatsAppQR, isWhatsAppConnected, onWhatsAppMessage, getActiveWhatsAppAgents, getOrCreateConnection, toJid } from './whatsapp.js';
