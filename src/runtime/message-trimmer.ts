/**
 * Universal Message Trimmer
 *
 * Reduces input token usage by trimming stale tool results and assistant text
 * from the conversation history. Applies to ALL tools (polymarket, web, browser,
 * email, etc.) — not domain-specific.
 *
 * Two stages:
 * 1. Inline truncation: caps each tool result at push time (prevents 17K+ results)
 * 2. Stale aging: trims old tool results + assistant text before each LLM call
 */

// ─── Configuration ────────────────────────────────────────────
// How many turns back before a message is considered stale
var STALE_TURN_THRESHOLD = 2;
// Minimum length before trimming kicks in (short results are left alone)
var STALE_MIN_LENGTH = 300;
// How many chars to keep from stale messages
var STALE_TRIM_TO = 120;
// Max chars per tool result at push time
var INLINE_RESULT_CAP = 3000;

// ─── Inline Truncation (at push time) ─────────────────────────

/**
 * Cap each tool result to INLINE_RESULT_CAP chars.
 * Call this before pushing tool results into the messages array.
 */
export function truncateToolResults(toolResults: Array<{ tool_use_id: string; content: string; is_error?: boolean }>): typeof toolResults {
  return toolResults.map(function(tr) {
    if (tr.content.length > INLINE_RESULT_CAP && !tr.is_error) {
      return {
        ...tr,
        content: tr.content.slice(0, INLINE_RESULT_CAP) +
          '\n\n... [truncated, ' + (tr.content.length - INLINE_RESULT_CAP) + ' chars omitted — re-call tool for full data]',
      };
    }
    return tr;
  });
}

// ─── Stale Aging (before each LLM call) ───────────────────────

/**
 * Walk messages and trim any tool_result/assistant text blocks older than
 * STALE_TURN_THRESHOLD turns. Mutates the messages array in place.
 *
 * Returns the number of messages trimmed (for logging).
 */
export function ageStaleMessages(messages: any[], currentTurn: number): number {
  var trimCount = 0;

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var msgTurn = msg._turn;
    if (!msgTurn || (currentTurn - msgTurn) < STALE_TURN_THRESHOLD) continue;

    // ── Trim stale tool_result blocks in user messages ──
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      var anyTrimmed = false;
      var trimmedContent = msg.content.map(function(block: any) {
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > STALE_MIN_LENGTH) {
          anyTrimmed = true;
          return { ...block, content: block.content.slice(0, STALE_TRIM_TO) + '\n[stale data — re-call tool for current values]' };
        }
        return block;
      });

      if (anyTrimmed) {
        trimCount++;
        var trimmedMsg = { ...msg, content: trimmedContent, _turn: msgTurn } as any;
        // Also trim the duplicate tool_results property (Anthropic format sometimes has both)
        if (trimmedMsg.tool_results) {
          trimmedMsg.tool_results = trimmedMsg.tool_results.map(function(tr: any) {
            if (typeof tr.content === 'string' && tr.content.length > STALE_MIN_LENGTH) {
              return { ...tr, content: tr.content.slice(0, STALE_TRIM_TO) + '\n[stale data — re-call tool for current values]' };
            }
            return tr;
          });
        }
        messages[i] = trimmedMsg;
      }
    }

    // ── Trim stale assistant text blocks (long reasoning accumulates) ──
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      var anyAssistTrimmed = false;
      var trimmedAssist = msg.content.map(function(block: any) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > STALE_MIN_LENGTH) {
          anyAssistTrimmed = true;
          return { ...block, text: block.text.slice(0, STALE_TRIM_TO) + '\n[earlier reasoning trimmed]' };
        }
        return block;
      });

      if (anyAssistTrimmed) {
        trimCount++;
        messages[i] = { ...msg, content: trimmedAssist, _turn: msgTurn } as any;
      }
    }
  }

  return trimCount;
}
