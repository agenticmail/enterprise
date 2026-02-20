/**
 * Shared Hono environment type for the entire application.
 * Defines context variables set by auth middleware and consumed by route handlers.
 */
export type AppEnv = {
  Variables: {
    userId: string;
    userRole: string;
    userEmail: string;
    authType: string;
    apiKeyScopes: string[];
    requestId: string;
  };
};
