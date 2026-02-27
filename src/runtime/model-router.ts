/**
 * Model Router — Per-context model selection for AI employees.
 * 
 * Different tasks need different models. Casual chat doesn't need Opus,
 * but drafting a client email or analyzing data does.
 * 
 * Config stored in agent's `modelRouting` (inside config JSON):
 * {
 *   chat: "anthropic/claude-sonnet-4-20250514",
 *   meeting: "anthropic/claude-sonnet-4-20250514",
 *   email: "anthropic/claude-opus-4-20250514",
 *   task: "anthropic/claude-opus-4-20250514",
 *   scheduling: "anthropic/claude-3-5-haiku-20241022",
 * }
 * 
 * Falls back to agent's default model if no routing configured for a context.
 */

export type ModelContext = 
  | 'chat'        // Google Chat conversations — fast, conversational
  | 'meeting'     // Google Meet voice — ultra-fast, low latency
  | 'email'       // Email compose/reply — professional writing quality
  | 'task'        // Complex tasks, projects, analysis — deep reasoning
  | 'scheduling'  // Calendar, reminders — quick and simple
  | 'full';       // Everything else — use default

export interface ModelRoute {
  provider: string;
  modelId: string;
}

export interface ModelRoutingConfig {
  chat?: string;       // provider/modelId
  meeting?: string;
  email?: string;
  task?: string;
  scheduling?: string;
}

// Human-readable labels for the dashboard
export const MODEL_CONTEXT_INFO: Record<string, { label: string; description: string; icon: string }> = {
  chat:       { label: 'Chat',              description: 'Google Chat conversations — fast replies',           icon: 'chat' },
  meeting:    { label: 'Meetings',          description: 'Google Meet voice — ultra-low latency',              icon: 'meeting' },
  email:      { label: 'Email',             description: 'Composing and replying to emails',                   icon: 'email' },
  task:       { label: 'Tasks & Projects',  description: 'Complex work, analysis, research — deep reasoning',  icon: 'task' },
  scheduling: { label: 'Scheduling',        description: 'Calendar management, reminders — quick and simple',  icon: 'calendar' },
};

/**
 * Parse a "provider/modelId" string into a ModelRoute.
 * Returns null if the string is empty or malformed.
 */
export function parseModelString(modelStr: string | undefined): ModelRoute | null {
  if (!modelStr) return null;
  const parts = modelStr.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { provider: parts[0], modelId: parts[1] };
}

/**
 * Resolve the model for a given session context.
 * 
 * Priority:
 * 1. modelRouting[context] — explicit per-context override
 * 2. Legacy voiceConfig.chatModel / voiceConfig.meetingModel (migration)
 * 3. null (use agent's default model)
 */
export function resolveModelForContext(
  agentConfig: any,
  context: ModelContext,
): ModelRoute | null {
  if (!agentConfig) return null;

  // 1. Check modelRouting (new system)
  const routing: ModelRoutingConfig | undefined = agentConfig.modelRouting;
  if (routing) {
    const contextModel = (routing as any)[context];
    if (contextModel) {
      const parsed = parseModelString(contextModel);
      if (parsed) return parsed;
    }
  }

  // 2. Legacy fallback — voiceConfig.chatModel / meetingModel
  const voiceConfig = agentConfig.voiceConfig;
  if (voiceConfig) {
    if (context === 'chat' && voiceConfig.chatModel) {
      return parseModelString(voiceConfig.chatModel);
    }
    if (context === 'meeting' && voiceConfig.meetingModel) {
      return parseModelString(voiceConfig.meetingModel);
    }
  }

  // 3. No override — caller uses default
  return null;
}
