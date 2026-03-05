/**
 * agent_stop — Stops the current agent session (not the process).
 * When the user says "stop", the agent calls this to abort the active session loop.
 */
import type { ToolDefinition, ToolCreationOptions } from '../../types.js';

export function createAgentControlTools(options?: ToolCreationOptions): ToolDefinition[] {
  return [
    {
      name: 'agent_stop',
      description: 'Stop the current session. Use when the user says "stop", "cancel", "abort", or wants you to immediately stop what you are doing. This terminates the current conversation loop — the agent process stays running for future messages.',
      input_schema: {
        type: 'object' as const,
        properties: {
          reason: { type: 'string', description: 'Why the session is being stopped' },
        },
        required: [],
      },
      execute: async (_id: string, params: any) => {
        const reason = params?.reason || 'User requested stop';
        const sessionId = options?.runtimeRef?.getCurrentSessionId?.();

        if (sessionId && options?.runtimeRef?.terminateSession) {
          console.log(`[agent-control] Terminating session ${sessionId}: ${reason}`);
          // Terminate after a short delay so the response gets sent
          setTimeout(async () => {
            try {
              await options.runtimeRef!.terminateSession!(sessionId);
            } catch (e: any) {
              console.warn(`[agent-control] terminateSession error: ${e.message}`);
            }
          }, 500);
          return { content: [{ type: 'text', text: `Session stopped. ${reason}` }] };
        }

        return { content: [{ type: 'text', text: `Stopped. ${reason}` }] };
      },
    },
  ];
}
