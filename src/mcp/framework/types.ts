/**
 * MCP Skill Framework — Shared Types
 *
 * Defines the interfaces that every skill adapter implements.
 * The framework handles boilerplate (auth, retry, circuit breaking, vault);
 * adapters focus on API endpoint mapping and response formatting.
 */

// ─── Auth Configuration ─────────────────────────────────

export type AuthType = 'oauth2' | 'api_key' | 'token' | 'credentials';

export interface AuthConfig {
  type: AuthType;

  // oauth2
  provider?: string;
  scopes?: string[];

  // api_key / token
  headerName?: string;      // Default: 'Authorization'
  headerPrefix?: string;    // Default: 'Bearer'
  envVar?: string;

  // credentials (multi-field, e.g. AWS accessKeyId + secretAccessKey)
  fields?: string[];
  envVars?: Record<string, string>;
}

export interface ResolvedCredentials {
  type: AuthType;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  token?: string;
  fields?: Record<string, string>;
  expiresAt?: Date;
}

// ─── API Executor ────────────────────────────────────────

export interface ApiRequestOptions {
  method: string;
  url?: string;             // Full URL override
  path?: string;            // Appended to adapter's baseUrl
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  formEncoded?: boolean;    // Send as application/x-www-form-urlencoded
  multipart?: boolean;      // Send as multipart/form-data
  rawBody?: Buffer | Uint8Array;  // Pre-built body (bypass JSON/form serialization)
  rawContentType?: string;  // Content-Type for rawBody
  timeoutMs?: number;
}

export interface ApiExecutor {
  get(path: string, query?: Record<string, string>): Promise<any>;
  post(path: string, body?: any): Promise<any>;
  put(path: string, body?: any): Promise<any>;
  patch(path: string, body?: any): Promise<any>;
  delete(path: string, query?: Record<string, string>): Promise<any>;
  request(opts: ApiRequestOptions): Promise<any>;
}

// ─── Tool Handler ────────────────────────────────────────

export interface ToolResult {
  /** Text content returned to the LLM */
  content: string;
  /** Structured data for activity logging */
  metadata?: Record<string, any>;
  /** Mark as error */
  isError?: boolean;
}

export interface ToolExecutionContext {
  credentials: ResolvedCredentials;
  skillConfig: Record<string, any>;
  orgId: string;
  agentId: string;
  apiExecutor: ApiExecutor;
}

export interface ToolHandler {
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, any>;
  /** Human-readable description for the LLM */
  description?: string;
  /** Execute the tool */
  execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult>;
}

// ─── Config Schema ──────────────────────────────────────

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

// ─── Skill Adapter ───────────────────────────────────────

export interface SkillAdapter {
  /** Must match the community-skills manifest id */
  skillId: string;
  /** Human-readable skill name */
  name: string;
  /** Base URL for all API calls (e.g. 'https://slack.com/api') */
  baseUrl: string;
  /** Auth configuration — matches manifest auth block */
  auth: AuthConfig;
  /** Extra default headers sent with every request */
  defaultHeaders?: Record<string, string>;
  /** Tool implementations keyed by tool ID */
  tools: Record<string, ToolHandler>;
  /** Called once after credentials are resolved (e.g. set dynamic base URL) */
  initialize?(credentials: ResolvedCredentials): Promise<void>;
  /** Per-adapter rate limits for proactive throttling */
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    burstLimit?: number;
  };
  /** JSON Schema for configurable fields (rendered in dashboard) */
  configSchema?: Record<string, ConfigField>;
}
