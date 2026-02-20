/**
 * Enterprise Engine — Public API
 *
 * The complete engine powering managed AgenticMail deployment:
 *
 * 1. Skill Registry + Permission Engine — what tools each agent can use
 * 2. Agent Config Generator — workspace files, gateway config, deploy scripts
 * 3. Deployment Engine — Docker, VPS, Fly.io, Railway provisioning
 * 4. Approval Workflows — human-in-the-loop for sensitive operations
 * 5. Agent Lifecycle Manager — state machine, health checks, auto-recovery
 * 6. Knowledge Base — document ingestion, chunking, RAG retrieval
 * 7. Multi-Tenant Isolation — org limits, quotas, billing, plan enforcement
 * 8. Real-Time Activity Tracking — live tool calls, conversations, cost tracking
 */

// 1. Skills & Permissions
export {
  PermissionEngine,
  BUILTIN_SKILLS,
  PRESET_PROFILES,
  type SkillDefinition,
  type ToolDefinition,
  type ConfigField,
  type SkillCategory,
  type ToolCategory,
  type RiskLevel,
  type SideEffect,
  type AgentPermissionProfile,
  type PermissionResult,
} from './skills.js';

// 2. Agent Configuration
export {
  AgentConfigGenerator,
  type AgentConfig,
  type ChannelConfig,
  type DeploymentTarget,
  type DeploymentConfig,
  type DeploymentStatus,
  type WorkspaceFiles,
  type GatewayConfig,
} from './agent-config.js';

// 3. Deployment Engine
export {
  DeploymentEngine,
  type DeploymentEvent,
  type DeploymentPhase,
  type DeploymentResult,
  type LiveAgentStatus,
} from './deployer.js';

// 4. Approval Workflows + Escalation Chains
export {
  ApprovalEngine,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalPolicy,
  type EscalationChain,
  type EscalationLevel,
  type EscalationState,
} from './approvals.js';

// 5. Agent Lifecycle Manager + Budget Controls
export {
  AgentLifecycleManager,
  type ManagedAgent,
  type AgentState,
  type StateTransition,
  type AgentHealth,
  type AgentUsage,
  type AgentBudgetConfig,
  type BudgetAlert,
  type LifecycleEvent,
  type LifecycleEventType,
} from './lifecycle.js';

// 6. Knowledge Base
export {
  KnowledgeBaseEngine,
  type KnowledgeBase,
  type KBDocument,
  type KBChunk,
  type KBConfig,
  type SearchResult,
} from './knowledge.js';

// 7. Multi-Tenant Isolation
export {
  TenantManager,
  PLAN_LIMITS,
  type Organization,
  type OrgPlan,
  type OrgLimits,
  type OrgUsage,
  type OrgFeature,
  type SSOConfig,
} from './tenant.js';

// 8. Real-Time Activity Tracking
export {
  ActivityTracker,
  type ActivityEvent,
  type ActivityType,
  type ToolCallRecord,
  type ConversationEntry,
  type AgentTimeline,
  type TimelineEntry,
} from './activity.js';

// 9. Tool Catalog (all AgenticMail tool IDs)
export {
  CORE_TOOLS,
  AGENTICMAIL_TOOLS,
  ALL_TOOLS,
  TOOL_INDEX,
  getToolsBySkill,
  generateToolPolicy,
} from './tool-catalog.js';

// 10. Database Persistence + Migration System
export { EngineDatabase, type EngineDB } from './db-adapter.js';
export {
  ENGINE_TABLES,
  ENGINE_TABLES_POSTGRES,
  MIGRATIONS,
  MIGRATIONS_TABLE,
  MIGRATIONS_TABLE_POSTGRES,
  sqliteToPostgres,
  sqliteToMySQL,
  type Migration,
  type DynamicTableDef,
} from './db-schema.js';

// 10. Data Loss Prevention (DLP)
export {
  DLPEngine,
  type DLPRule,
  type DLPViolation,
  type DLPScanResult,
} from './dlp.js';

// 13. Agent-to-Agent Communication
export {
  AgentCommunicationBus,
  type AgentMessage,
  type MessageType,
  type MessageStatus,
  type MessagePriority,
} from './communication.js';

// 14. Guardrails — Real-time Intervention & Anomaly Detection
export {
  GuardrailEngine,
  type InterventionRecord,
  type AnomalyRule,
} from './guardrails.js';

// 15. Action Journal + Rollback
export {
  ActionJournal,
  type JournalEntry,
  type ActionType,
  type RollbackResult,
} from './journal.js';

// 16. Compliance Reporting
export {
  ComplianceReporter,
  type ComplianceReport,
} from './compliance.js';

// 17. Community Skill Registry (Marketplace)
export {
  CommunitySkillRegistry,
  type CommunitySkillManifest,
  type IndexedCommunitySkill,
  type InstalledCommunitySkill,
  type CommunitySkillReview,
} from './community-registry.js';

// 18. Skill Validator (CLI + CI)
export {
  validateSkillManifest,
  collectCommunityToolIds,
  type ManifestValidationResult,
  VALID_CATEGORIES,
  VALID_TOOL_CATEGORIES,
  VALID_RISK_LEVELS,
  VALID_SIDE_EFFECTS,
  VALID_SPDX_LICENSES,
} from './skill-validator.js';

// 19. Workforce Management
export {
  WorkforceManager,
} from './workforce.js';

// 20. Organization Policies
export {
  OrgPolicyEngine,
} from './org-policies.js';

// 21. Agent Memory
export {
  AgentMemoryManager,
} from './agent-memory.js';

// 22. Onboarding
export {
  OnboardingManager,
} from './onboarding.js';

// 23. Secure Vault
export {
  SecureVault,
} from './vault.js';

// 24. Storage Manager
export {
  StorageManager,
} from './storage-manager.js';

// 25. Agent Runtime
export {
  AgentRuntime,
  createAgentRuntime,
  SessionManager as RuntimeSessionManager,
  createRuntimeHooks,
  createNoopHooks,
  runAgentLoop,
  SubAgentManager,
  EmailChannel,
  FollowUpScheduler,
  callLLM,
  toolsToDefinitions,
  ToolRegistry,
  executeTool,
  type AgentConfig as RuntimeAgentConfig,
  type SessionState as RuntimeSessionState,
  type StreamEvent as RuntimeStreamEvent,
  type RuntimeConfig,
  type ModelConfig as RuntimeModelConfig,
  type SpawnOptions as RuntimeSpawnOptions,
  type RuntimeHooks,
  type BudgetCheckResult as RuntimeBudgetCheckResult,
  type FollowUp as RuntimeFollowUp,
  PROVIDER_REGISTRY,
  resolveProvider,
  resolveApiKeyForProvider,
  listAllProviders,
  type ProviderDef,
  type CustomProviderDef,
  type ApiType,
} from '../runtime/index.js';
