/**
 * Google Chat Webhook Routes
 *
 * Receives incoming Google Chat events (messages, @mentions, added-to-space, etc.)
 * and routes them to the appropriate agent for response.
 *
 * Flow:
 * 1. Google Chat sends POST to /api/engine/chat-webhook
 * 2. We identify the target agent (running + chat-enabled)
 * 3. Forward to the agent's process via POST /api/runtime/chat
 * 4. Agent processes and replies via google_chat_send_message tool
 * 5. We return an immediate acknowledgment to Google (async processing)
 *
 * Agents can run as:
 * - Standalone PM2 processes on known ports (standaloneAgents config)
 * - Local runtime (enterprise server has runtime enabled)
 * - Remote Fly.io machines
 */

import { Hono } from 'hono';
import type { AgentLifecycleManager } from './lifecycle.js';

// ─── Types ──────────────────────────────────────────────

interface ChatEvent {
  type: 'MESSAGE' | 'ADDED_TO_SPACE' | 'REMOVED_FROM_SPACE' | 'CARD_CLICKED';
  eventTime?: string;
  token?: { text?: string };
  message?: {
    name?: string;
    text?: string;
    sender?: ChatUser;
    space?: ChatSpace;
    thread?: { name?: string };
    createTime?: string;
    argumentText?: string;
  };
  user?: ChatUser;
  space?: ChatSpace;
  configCompleteRedirectUrl?: string;
}

interface ChatUser {
  name?: string;
  displayName?: string;
  email?: string;
  type?: 'HUMAN' | 'BOT';
  domainId?: string;
}

interface ChatSpace {
  name?: string;
  displayName?: string;
  type?: 'DM' | 'ROOM' | 'GROUP_CHAT';
  singleUserBotDm?: boolean;
}

interface StandaloneAgent {
  id: string;
  port: number;
  host?: string; // default: localhost
}

// ─── Route Factory ──────────────────────────────────────

export function createChatWebhookRoutes(opts: {
  lifecycle: AgentLifecycleManager;
  getRuntime: () => any | null;
  projectNumber?: string;
  standaloneAgents?: StandaloneAgent[];
  getStandaloneAgents?: () => StandaloneAgent[];
}): Hono {
  const app = new Hono();
  const { lifecycle, getRuntime, standaloneAgents: staticAgents, getStandaloneAgents } = opts;
  // Dynamic getter preferred — falls back to static array for backwards compat
  const resolveStandaloneAgents = () => getStandaloneAgents ? getStandaloneAgents() : (staticAgents || []);

  app.post('/', async (c) => {
    // ── Webhook security (DB-backed) ──────────────────
    try {
      const { getNetworkConfig } = await import('../middleware/network-config.js');
      const netConfig = await getNetworkConfig();
      const ws = netConfig.webhookSecurity;
      if (ws?.enabled && ws.allowedSourceIps?.length) {
        const { compileIpMatcher } = await import('../lib/cidr.js');
        const matcher = compileIpMatcher(ws.allowedSourceIps);
        const sourceIp =
          c.req.header('cf-connecting-ip') ||
          c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
          c.req.header('x-real-ip') ||
          'unknown';
        if (!matcher(sourceIp)) {
          console.log(`[chat-webhook] Blocked webhook from ${sourceIp} (not in allowed source IPs)`);
          return c.json({ error: 'Forbidden' }, 403);
        }
      }
    } catch {}

    let event: ChatEvent;
    try {
      event = await c.req.json<ChatEvent>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    // Always log the raw payload for debugging
    console.log(`[chat-webhook] Raw payload: ${JSON.stringify(event).slice(0, 800)}`);
    
    // Google Workspace add-ons may wrap the event differently
    // Try to extract from common wrapper formats
    const chatEvent = (event as any).chat || (event as any).commonEventObject?.chat || event;
    const eventType = event.type || chatEvent.type || (event as any).eventType;
    const space = event.space || chatEvent.space || (event as any).message?.space;
    const spaceName = space?.displayName || space?.name || 'unknown';
    console.log(`[chat-webhook] Event: type=${eventType}, space=${spaceName}`);

    switch (eventType) {
      case 'ADDED_TO_SPACE':
        console.log(`[chat-webhook] Bot added to: ${spaceName}`);
        return c.json({ text: `Hello! I'm here to help. Feel free to message me anytime.` });

      case 'REMOVED_FROM_SPACE':
        console.log(`[chat-webhook] Bot removed from: ${spaceName}`);
        return c.json({});

      case 'MESSAGE':
        return await handleMessage(c, event, lifecycle, getRuntime, resolveStandaloneAgents());

      case 'CARD_CLICKED':
        return c.json({ text: 'Got it!' });

      default:
        return c.json({});
    }
  });

  return app;
}

// ─── Message Handler ────────────────────────────────────

async function handleMessage(
  c: any,
  event: ChatEvent,
  lifecycle: AgentLifecycleManager,
  getRuntime: () => any | null,
  standaloneAgents: StandaloneAgent[],
) {
  const msg = event.message;
  const sender = msg?.sender || event.user;
  const space = msg?.space || event.space;

  const messageText = msg?.argumentText?.trim() || msg?.text?.trim() || '';
  if (!messageText) return c.json({});

  const senderEmail = sender?.email || 'unknown';
  const senderName = sender?.displayName || 'Unknown';
  const spaceId = space?.name || '';
  const threadId = msg?.thread?.name || '';
  const isDM = space?.type === 'DM' || space?.singleUserBotDm === true;

  console.log(`[chat-webhook] ${senderName} (${senderEmail}) in ${space?.displayName || spaceId}: "${messageText.slice(0, 100)}"`);

  // Skip bot messages
  if (sender?.type === 'BOT') return c.json({});

  // Build the chat context payload
  const chatContext = {
    source: 'google_chat',
    senderName,
    senderEmail,
    spaceName: space?.displayName || 'DM',
    spaceId,
    threadId,
    isDM,
    messageText,
  };

  // ─── Strategy 1: Forward to standalone agent processes ────
  // Try all standalone agents — first healthy one with chat enabled wins
  for (const sa of standaloneAgents) {
    const host = sa.host || 'localhost';
    const agentUrl = `http://${host}:${sa.port}/api/runtime/chat`;
    try {
      const resp = await fetch(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatContext),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const result = await resp.json() as any;
        console.log(`[chat-webhook] Forwarded to standalone agent ${sa.id} on port ${sa.port} → session ${result.sessionId || 'ok'}`);
        if (result.text) return c.json({ text: result.text });
        return c.json({}); // Agent will reply async via Chat API
      } else {
        console.warn(`[chat-webhook] Standalone agent ${sa.id}:${sa.port} returned ${resp.status}`);
      }
    } catch (err: any) {
      console.warn(`[chat-webhook] Standalone agent ${sa.id}:${sa.port} unreachable: ${err.message}`);
    }
  }

  // ─── Strategy 2: Lifecycle-managed agents (in-process or Fly.io) ────
  const allAgents = lifecycle.getAllAgents();
  for (const agent of allAgents) {
    if (agent.state !== 'running') continue;
    const services = agent.config?.enabledGoogleServices || [];
    if (!services.includes('chat') && services.length > 0) continue;

    const agentName = agent.config?.displayName || agent.config?.name || 'Agent';
    console.log(`[chat-webhook] Routing to lifecycle agent: ${agentName} (${agent.id})`);

    // Try Fly.io machine
    const flyAppName = agent.config?.deployment?.config?.cloud?.appName
      || (agent.config?.deployment?.config as any)?.flyAppName;
    if (flyAppName) {
      try {
        const resp = await fetch(`https://${flyAppName}.fly.dev/api/runtime/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatContext),
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          console.log(`[chat-webhook] Forwarded to Fly.io: ${flyAppName}`);
          return c.json({});
        }
      } catch (err: any) {
        console.warn(`[chat-webhook] Fly.io ${flyAppName} unreachable: ${err.message}`);
      }
    }

    // Try local runtime
    const runtime = getRuntime();
    if (runtime) {
      try {
        const systemPrompt = buildChatSystemPrompt({
          senderName, senderEmail, spaceName: space?.displayName || 'DM',
          spaceId, threadId, isDM, agentName,
          agentIdentity: agent.config?.identity,
        });
        const session = await runtime.spawnSession({
          agentId: agent.id,
          message: messageText,
          systemPrompt,
        });
        console.log(`[chat-webhook] Local session ${session.id} created`);
        return c.json({});
      } catch (err: any) {
        console.error(`[chat-webhook] Local session failed: ${err.message}`);
      }
    }
  }

  console.warn(`[chat-webhook] No agent could handle the message`);
  return c.json({ text: `I'm currently unavailable. Please try again later.` });
}

// ─── System Prompt Builder ──────────────────────────────

function buildChatSystemPrompt(ctx: {
  senderName: string;
  senderEmail: string;
  spaceName: string;
  spaceId: string;
  threadId: string;
  isDM: boolean;
  agentName: string;
  agentIdentity?: any;
}): string {
  const { senderName, senderEmail, spaceName, spaceId, threadId, isDM, agentName, agentIdentity } = ctx;

  const identityBlock = agentIdentity
    ? `You are ${agentName}, a ${agentIdentity.role || 'professional'} at the organization.`
    : `You are ${agentName}.`;

  return `${identityBlock}

## Context
You received a Google Chat message.
- **From**: ${senderName} (${senderEmail})
- **Space**: ${spaceName} (${isDM ? 'Direct Message' : 'Group Space'})
- **Space ID**: ${spaceId}
${threadId ? `- **Thread**: ${threadId}` : ''}

## Instructions
1. Respond helpfully and concisely to the message.
2. Use google_chat_send_message to reply:
   - spaceName: "${spaceId}"
   ${threadId ? `- threadName: "${threadId}"` : ''}
3. Keep it short — this is chat, not email.
4. Be conversational and natural.

## Important
- After sending your reply via the tool, your work is done.
- Do NOT use email tools for this. Reply ONLY via google_chat_send_message.`;
}
