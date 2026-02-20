/**
 * AgenticMail Agent Tools — Enterprise Notifications
 *
 * Multi-channel notification system supporting console, email (SMTP),
 * Slack webhooks, and generic webhooks. Stores notification history
 * in {workspaceDir}/.agenticmail/notifications.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readStringArrayParam, jsonResult, errorResult } from '../common.js';

type NotificationChannel = 'email' | 'slack' | 'webhook' | 'console';
type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
type NotificationStatus = 'sent' | 'failed' | 'scheduled' | 'escalation';

type NotificationRecord = {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  message: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  createdAt: string;
  sendAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

type NotificationStore = {
  notifications: NotificationRecord[];
};

function isPrivateUrl(url: string): boolean {
  try {
    var hostname = new URL(url).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (hostname === '0.0.0.0' || hostname === '') return true;
    var parts = hostname.split('.');
    if (parts[0] === '10') return true;
    if (parts[0] === '172') {
      var second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    if (parts[0] === '192' && parts[1] === '168') return true;
    if (parts[0] === '169' && parts[1] === '254') return true;
    if (hostname.startsWith('fc00:') || hostname.startsWith('fd') || hostname.startsWith('fe80:')) return true;
    return false;
  } catch {
    return true;
  }
}

async function loadNotificationStore(storePath: string): Promise<NotificationStore> {
  try {
    var content = await fs.readFile(storePath, 'utf-8');
    return JSON.parse(content) as NotificationStore;
  } catch {
    return { notifications: [] };
  }
}

async function saveNotificationStore(storePath: string, store: NotificationStore): Promise<void> {
  var dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  var data = JSON.stringify(store, null, 2);
  var tmpPath = storePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, storePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

async function sendSingleNotification(
  channel: NotificationChannel,
  recipient: string,
  subject: string,
  message: string,
  priority: NotificationPriority,
): Promise<{ success: boolean; error?: string }> {
  switch (channel) {
    case 'console': {
      var prefix = priority === 'urgent' ? '[URGENT] ' : priority === 'high' ? '[HIGH] ' : '';
      console.log('[AgenticMail Notification] ' + prefix + subject + ' -> ' + recipient + ': ' + message);
      return { success: true };
    }
    case 'email': {
      var smtpHost = process.env.SMTP_HOST;
      var smtpPort = process.env.SMTP_PORT || '25';
      if (!smtpHost) {
        console.log('[AgenticMail Email] No SMTP_HOST configured. Logging email: To=' + recipient + ' Subject=' + subject);
        return { success: true, error: 'No SMTP configured, logged to console' };
      }
      try {
        var net = await import('node:net');
        var socket = net.createConnection(parseInt(smtpPort, 10), smtpHost);
        var fromAddr = process.env.SMTP_FROM || 'noreply@agenticmail.io';
        await new Promise<void>(function(resolve, reject) {
          var commands = [
            'HELO agenticmail.io\r\n',
            'MAIL FROM:<' + fromAddr + '>\r\n',
            'RCPT TO:<' + recipient + '>\r\n',
            'DATA\r\n',
            'Subject: ' + subject + '\r\nFrom: ' + fromAddr + '\r\nTo: ' + recipient + '\r\n\r\n' + message + '\r\n.\r\n',
            'QUIT\r\n',
          ];
          var cmdIdx = 0;
          socket.on('data', function() {
            if (cmdIdx < commands.length) {
              socket.write(commands[cmdIdx]);
              cmdIdx++;
            } else {
              resolve();
            }
          });
          socket.on('error', function(err: Error) { reject(err); });
          setTimeout(function() { reject(new Error('SMTP timeout')); }, 10000);
        });
        socket.destroy();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: 'SMTP error: ' + (err.message || 'connection failed') };
      }
    }
    case 'slack': {
      var webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        console.log('[AgenticMail Slack] No SLACK_WEBHOOK_URL configured. Logging: ' + subject + ' - ' + message);
        return { success: true, error: 'No Slack webhook configured, logged to console' };
      }
      try {
        var slackBody = JSON.stringify({ text: '*' + subject + '*\n' + message });
        var resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: slackBody,
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return { success: false, error: 'Slack returned status ' + resp.status };
        return { success: true };
      } catch (err: any) {
        return { success: false, error: 'Slack error: ' + (err.message || 'request failed') };
      }
    }
    case 'webhook': {
      if (isPrivateUrl(recipient)) {
        return { success: false, error: 'SSRF protection: private/internal URLs are blocked' };
      }
      try {
        var payload = JSON.stringify({ subject: subject, message: message, priority: priority });
        var resp = await fetch(recipient, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(5000),
        });
        return { success: resp.ok, error: resp.ok ? undefined : 'Webhook returned status ' + resp.status };
      } catch (err: any) {
        return { success: false, error: 'Webhook error: ' + (err.message || 'request failed') };
      }
    }
    default:
      return { success: false, error: 'Unknown channel: ' + channel };
  }
}

export function createEnterpriseNotificationTools(options?: ToolCreationOptions): AnyAgentTool[] {
  var storePath = path.join(
    options?.workspaceDir || process.cwd(),
    '.agenticmail',
    'notifications.json',
  );

  return [
    {
      name: 'ent_notify_send',
      label: 'Send Notification',
      description: 'Send a notification via email, Slack, webhook, or console. Logs all notifications to history.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Notification channel.', enum: ['email', 'slack', 'webhook', 'console'] },
          recipient: { type: 'string', description: 'Recipient email, Slack channel, or webhook URL.' },
          subject: { type: 'string', description: 'Notification subject line.' },
          message: { type: 'string', description: 'Notification body message.' },
          priority: { type: 'string', description: 'Priority level.', enum: ['low', 'normal', 'high', 'urgent'] },
        },
        required: ['channel', 'recipient', 'subject', 'message'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var channel = readStringParam(params, 'channel', { required: true }) as NotificationChannel;
          var recipient = readStringParam(params, 'recipient', { required: true });
          var subject = readStringParam(params, 'subject', { required: true });
          var message = readStringParam(params, 'message', { required: true });
          var priority = (readStringParam(params, 'priority') || 'normal') as NotificationPriority;

          var result = await sendSingleNotification(channel, recipient, subject, message, priority);
          var now = new Date().toISOString();

          var record: NotificationRecord = {
            id: crypto.randomUUID(),
            channel: channel,
            recipient: recipient,
            subject: subject,
            message: message,
            priority: priority,
            status: result.success ? 'sent' : 'failed',
            createdAt: now,
            error: result.error,
          };

          var store = await loadNotificationStore(storePath);
          store.notifications.push(record);
          await saveNotificationStore(storePath, store);

          return jsonResult(record);
        } catch (err: any) {
          return errorResult(err.message || 'Failed to send notification.');
        }
      },
    },
    {
      name: 'ent_notify_broadcast',
      label: 'Broadcast Notification',
      description: 'Send the same notification to multiple recipients on a single channel. Returns a summary of successes and failures.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Notification channel.', enum: ['email', 'slack', 'webhook', 'console'] },
          recipients: { type: 'string', description: 'Comma-separated list of recipients.' },
          subject: { type: 'string', description: 'Notification subject line.' },
          message: { type: 'string', description: 'Notification body message.' },
        },
        required: ['channel', 'recipients', 'subject', 'message'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var channel = readStringParam(params, 'channel', { required: true }) as NotificationChannel;
          var recipients = readStringArrayParam(params, 'recipients', { required: true });
          var subject = readStringParam(params, 'subject', { required: true });
          var message = readStringParam(params, 'message', { required: true });

          var store = await loadNotificationStore(storePath);
          var now = new Date().toISOString();
          var successes = 0;
          var failures = 0;
          var errors: Array<{ recipient: string; error: string }> = [];

          for (var i = 0; i < recipients.length; i++) {
            var recipient = recipients[i];
            var result = await sendSingleNotification(channel, recipient, subject, message, 'normal');
            var record: NotificationRecord = {
              id: crypto.randomUUID(),
              channel: channel,
              recipient: recipient,
              subject: subject,
              message: message,
              priority: 'normal',
              status: result.success ? 'sent' : 'failed',
              createdAt: now,
              error: result.error,
            };
            store.notifications.push(record);
            if (result.success) {
              successes++;
            } else {
              failures++;
              errors.push({ recipient: recipient, error: result.error || 'Unknown error' });
            }
          }

          await saveNotificationStore(storePath, store);

          return jsonResult({
            total: recipients.length,
            successes: successes,
            failures: failures,
            errors: errors.length > 0 ? errors : undefined,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to broadcast notification.');
        }
      },
    },
    {
      name: 'ent_notify_webhook',
      label: 'Fire Webhook',
      description: 'Fire a webhook with a custom payload. Supports POST and PUT methods with configurable headers. Includes SSRF protection.',
      category: 'utility',
      risk: 'high',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Webhook URL to call.' },
          payload: { type: 'string', description: 'JSON string payload to send.' },
          method: { type: 'string', description: 'HTTP method (POST or PUT).', enum: ['POST', 'PUT'] },
          headers: { type: 'string', description: 'Optional JSON string of headers.' },
        },
        required: ['url', 'payload'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var url = readStringParam(params, 'url', { required: true });
          var payloadRaw = readStringParam(params, 'payload', { required: true });
          var method = readStringParam(params, 'method') || 'POST';
          var headersRaw = readStringParam(params, 'headers');

          if (isPrivateUrl(url)) {
            return errorResult('SSRF protection: private/internal URLs are blocked.');
          }

          var payload: unknown;
          try {
            payload = JSON.parse(payloadRaw);
          } catch {
            return errorResult('Invalid payload JSON.');
          }

          var headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (headersRaw) {
            try {
              var customHeaders = JSON.parse(headersRaw);
              Object.assign(headers, customHeaders);
            } catch {
              return errorResult('Invalid headers JSON.');
            }
          }

          var resp = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
          });

          var responseBody = await resp.text();
          var truncated = responseBody.length > 10000 ? responseBody.slice(0, 10000) + '...(truncated)' : responseBody;

          return jsonResult({
            status: resp.status,
            statusText: resp.statusText,
            body: truncated,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Webhook request failed.');
        }
      },
    },
    {
      name: 'ent_notify_escalate',
      label: 'Create Escalation',
      description: 'Create an escalation chain with multiple levels. Each level specifies a recipient, channel, and delay. The first level is triggered immediately.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The escalation message.' },
          levels: { type: 'string', description: 'JSON array of levels: [{recipient, channel, delay_minutes}].' },
          request_id: { type: 'string', description: 'Optional related workflow request ID.' },
        },
        required: ['message', 'levels'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var message = readStringParam(params, 'message', { required: true });
          var levelsRaw = readStringParam(params, 'levels', { required: true });
          var requestId = readStringParam(params, 'request_id');

          var levels: Array<{ recipient: string; channel: NotificationChannel; delay_minutes: number }>;
          try {
            levels = JSON.parse(levelsRaw);
          } catch {
            return errorResult('Invalid levels JSON. Expected: [{recipient, channel, delay_minutes}].');
          }

          if (!Array.isArray(levels) || levels.length === 0) {
            return errorResult('Levels must be a non-empty array.');
          }

          var store = await loadNotificationStore(storePath);
          var now = new Date().toISOString();
          var escalationId = crypto.randomUUID();

          // Trigger first level immediately
          var firstLevel = levels[0];
          var result = await sendSingleNotification(
            firstLevel.channel,
            firstLevel.recipient,
            'Escalation: ' + message,
            message,
            'urgent',
          );

          var firstRecord: NotificationRecord = {
            id: crypto.randomUUID(),
            channel: firstLevel.channel,
            recipient: firstLevel.recipient,
            subject: 'Escalation: ' + message,
            message: message,
            priority: 'urgent',
            status: result.success ? 'sent' : 'failed',
            createdAt: now,
            error: result.error,
            metadata: { escalationId: escalationId, level: 0, requestId: requestId },
          };
          store.notifications.push(firstRecord);

          // Store remaining levels as escalation records
          for (var i = 1; i < levels.length; i++) {
            var level = levels[i];
            var scheduledAt = new Date(Date.now() + level.delay_minutes * 60 * 1000).toISOString();
            var escalationRecord: NotificationRecord = {
              id: crypto.randomUUID(),
              channel: level.channel,
              recipient: level.recipient,
              subject: 'Escalation (Level ' + i + '): ' + message,
              message: message,
              priority: 'urgent',
              status: 'escalation',
              createdAt: now,
              sendAt: scheduledAt,
              metadata: { escalationId: escalationId, level: i, requestId: requestId },
            };
            store.notifications.push(escalationRecord);
          }

          await saveNotificationStore(storePath, store);

          var plan = levels.map(function(lvl, idx) {
            return {
              level: idx,
              recipient: lvl.recipient,
              channel: lvl.channel,
              delay_minutes: lvl.delay_minutes,
              status: idx === 0 ? (result.success ? 'sent' : 'failed') : 'scheduled',
            };
          });

          return jsonResult({
            escalationId: escalationId,
            message: message,
            requestId: requestId || null,
            plan: plan,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to create escalation.');
        }
      },
    },
    {
      name: 'ent_notify_schedule',
      label: 'Schedule Notification',
      description: 'Schedule a notification to be sent at a specified future time. Stores the notification with status "scheduled".',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Notification channel.', enum: ['email', 'slack', 'webhook', 'console'] },
          recipient: { type: 'string', description: 'Recipient email, Slack channel, or webhook URL.' },
          subject: { type: 'string', description: 'Notification subject line.' },
          message: { type: 'string', description: 'Notification body message.' },
          send_at: { type: 'string', description: 'ISO datetime when the notification should be sent.' },
        },
        required: ['channel', 'recipient', 'subject', 'message', 'send_at'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var channel = readStringParam(params, 'channel', { required: true }) as NotificationChannel;
          var recipient = readStringParam(params, 'recipient', { required: true });
          var subject = readStringParam(params, 'subject', { required: true });
          var message = readStringParam(params, 'message', { required: true });
          var sendAt = readStringParam(params, 'send_at', { required: true });

          var sendDate = new Date(sendAt);
          if (isNaN(sendDate.getTime())) {
            return errorResult('Invalid send_at datetime. Use ISO format (e.g. 2025-12-31T09:00:00Z).');
          }

          if (sendDate.getTime() <= Date.now()) {
            return errorResult('send_at must be in the future.');
          }

          var now = new Date().toISOString();
          var record: NotificationRecord = {
            id: crypto.randomUUID(),
            channel: channel,
            recipient: recipient,
            subject: subject,
            message: message,
            priority: 'normal',
            status: 'scheduled',
            createdAt: now,
            sendAt: sendDate.toISOString(),
          };

          var store = await loadNotificationStore(storePath);
          store.notifications.push(record);
          await saveNotificationStore(storePath, store);

          return jsonResult({
            scheduled: true,
            notification_id: record.id,
            channel: channel,
            recipient: recipient,
            subject: subject,
            send_at: record.sendAt,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to schedule notification.');
        }
      },
    },
  ];
}
