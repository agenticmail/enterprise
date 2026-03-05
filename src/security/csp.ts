/**
 * Content Security Policy (CSP) Builder
 * 
 * Generates and applies CSP headers based on security configuration
 */

export interface CspConfig {
  enabled?: boolean;
  cspPolicy?: string; // Custom policy override
  frameAncestors?: string[]; // CSP frame-ancestors
  scriptSrc?: string[]; // CSP script-src
  connectSrc?: string[]; // CSP connect-src
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  childSrc?: string[];
  workerSrc?: string[];
  baseUri?: string[];
  formAction?: string[];
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
  requireSriFor?: string[]; // script, style, etc.
  reportUri?: string;
  reportTo?: string;
}

/**
 * Default CSP configuration for secure baseline
 */
export const DEFAULT_CSP_CONFIG: Required<Omit<CspConfig, 'reportUri' | 'reportTo' | 'cspPolicy'>> = {
  enabled: true,
  frameAncestors: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for many apps
  connectSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"],
  fontSrc: ["'self'", "https:", "data:"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  childSrc: ["'self'"],
  workerSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  upgradeInsecureRequests: true,
  blockAllMixedContent: false,
  requireSriFor: []
};

/**
 * Common CSP presets for different application types
 */
export const CSP_PRESETS = {
  strict: {
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: true,
    blockAllMixedContent: true
  },
  
  moderate: {
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    upgradeInsecureRequests: true
  },
  
  development: {
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "localhost:*", "127.0.0.1:*"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:", "http:"],
    connectSrc: ["'self'", "ws:", "wss:", "localhost:*", "127.0.0.1:*"],
    frameAncestors: ["'self'"],
    upgradeInsecureRequests: false
  },
  
  api_only: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"]
  }
};

/**
 * Build CSP policy string from configuration
 */
export function buildCspPolicy(config: CspConfig = {}): string {
  // If custom policy is provided, use it directly
  if (config.cspPolicy) {
    return config.cspPolicy;
  }
  
  const mergedConfig = { ...DEFAULT_CSP_CONFIG, ...config };
  const directives: string[] = [];
  
  // Default source
  if (mergedConfig.scriptSrc || mergedConfig.styleSrc || mergedConfig.imgSrc) {
    directives.push(`default-src 'self'`);
  }
  
  // Script sources
  if (mergedConfig.scriptSrc?.length > 0) {
    directives.push(`script-src ${mergedConfig.scriptSrc.join(' ')}`);
  }
  
  // Style sources
  if (mergedConfig.styleSrc?.length > 0) {
    directives.push(`style-src ${mergedConfig.styleSrc.join(' ')}`);
  }
  
  // Image sources
  if (mergedConfig.imgSrc?.length > 0) {
    directives.push(`img-src ${mergedConfig.imgSrc.join(' ')}`);
  }
  
  // Font sources
  if (mergedConfig.fontSrc?.length > 0) {
    directives.push(`font-src ${mergedConfig.fontSrc.join(' ')}`);
  }
  
  // Connection sources
  if (mergedConfig.connectSrc?.length > 0) {
    directives.push(`connect-src ${mergedConfig.connectSrc.join(' ')}`);
  }
  
  // Object sources
  if (mergedConfig.objectSrc?.length > 0) {
    directives.push(`object-src ${mergedConfig.objectSrc.join(' ')}`);
  }
  
  // Media sources
  if (mergedConfig.mediaSrc?.length > 0) {
    directives.push(`media-src ${mergedConfig.mediaSrc.join(' ')}`);
  }
  
  // Child sources (frames)
  if (mergedConfig.childSrc?.length > 0) {
    directives.push(`child-src ${mergedConfig.childSrc.join(' ')}`);
  }
  
  // Worker sources
  if (mergedConfig.workerSrc?.length > 0) {
    directives.push(`worker-src ${mergedConfig.workerSrc.join(' ')}`);
  }
  
  // Frame ancestors
  if (mergedConfig.frameAncestors?.length > 0) {
    directives.push(`frame-ancestors ${mergedConfig.frameAncestors.join(' ')}`);
  }
  
  // Base URI
  if (mergedConfig.baseUri?.length > 0) {
    directives.push(`base-uri ${mergedConfig.baseUri.join(' ')}`);
  }
  
  // Form action
  if (mergedConfig.formAction?.length > 0) {
    directives.push(`form-action ${mergedConfig.formAction.join(' ')}`);
  }
  
  // Upgrade insecure requests
  if (mergedConfig.upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }
  
  // Block all mixed content
  if (mergedConfig.blockAllMixedContent) {
    directives.push('block-all-mixed-content');
  }
  
  // Require SRI for
  if (mergedConfig.requireSriFor?.length > 0) {
    directives.push(`require-sri-for ${mergedConfig.requireSriFor.join(' ')}`);
  }
  
  // Reporting
  if (config.reportUri) {
    directives.push(`report-uri ${config.reportUri}`);
  }
  
  if (config.reportTo) {
    directives.push(`report-to ${config.reportTo}`);
  }
  
  return directives.join('; ');
}

/**
 * Validate CSP configuration
 */
export function validateCspConfig(config: CspConfig): string[] {
  const errors: string[] = [];
  
  // Check for dangerous configurations
  if (config.scriptSrc?.includes("'unsafe-eval'")) {
    errors.push("'unsafe-eval' in script-src allows dangerous code execution");
  }
  
  if (config.objectSrc?.includes('*') || config.objectSrc?.includes('data:')) {
    errors.push('Wildcard or data: in object-src can allow plugin-based attacks');
  }
  
  if (config.frameAncestors?.includes('*')) {
    errors.push('Wildcard in frame-ancestors allows any site to embed your content');
  }
  
  // Check for missing security directives
  if (!config.objectSrc || config.objectSrc.length === 0) {
    errors.push("object-src should be explicitly set (recommend 'none')");
  }
  
  if (!config.baseUri || config.baseUri.length === 0) {
    errors.push("base-uri should be explicitly set (recommend 'self')");
  }
  
  return errors;
}

/**
 * Apply CSP header to response
 */
export function applyCspHeader(
  response: any, // Generic response object (Express, Hono, etc.)
  config: CspConfig,
  reportOnly: boolean = false
): void {
  if (!config.enabled) {
    return;
  }
  
  const policy = buildCspPolicy(config);
  const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  
  if (response.setHeader) {
    // Express-style
    response.setHeader(headerName, policy);
  } else if (response.header) {
    // Hono-style
    response.header(headerName, policy);
  } else if (response.headers) {
    // Generic headers object
    response.headers[headerName] = policy;
  }
}

/**
 * Create CSP middleware for web frameworks
 */
export function createCspMiddleware(
  config: CspConfig,
  options: {
    reportOnly?: boolean;
    skipPaths?: string[];
    onViolation?: (violation: any) => void;
  } = {}
) {
  return (req: any, res: any, next: any) => {
    // Skip CSP for certain paths
    if (options.skipPaths?.some(path => req.url?.startsWith(path))) {
      return next();
    }
    
    applyCspHeader(res, config, options.reportOnly);
    
    if (next) {
      next();
    }
  };
}

/**
 * Generate nonce for inline scripts/styles
 */
export function generateNonce(): string {
  // Generate 16-byte random value, base64 encoded
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}

/**
 * Add nonce to CSP configuration
 */
export function addNonceToConfig(config: CspConfig, nonce: string): CspConfig {
  const nonceValue = `'nonce-${nonce}'`;
  
  return {
    ...config,
    scriptSrc: config.scriptSrc ? [...config.scriptSrc, nonceValue] : [nonceValue],
    styleSrc: config.styleSrc ? [...config.styleSrc, nonceValue] : [nonceValue]
  };
}

/**
 * CSP violation report parser
 */
export interface CspViolation {
  blockedUri: string;
  disposition: 'enforce' | 'report';
  documentUri: string;
  effectiveDirective: string;
  originalPolicy: string;
  referrer?: string;
  scriptSample?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  statusCode?: number;
  violatedDirective: string;
}

/**
 * Parse CSP violation report
 */
export function parseCspViolation(reportBody: any): CspViolation | null {
  try {
    const report = reportBody['csp-report'] || reportBody;
    
    return {
      blockedUri: report['blocked-uri'] || '',
      disposition: report.disposition || 'enforce',
      documentUri: report['document-uri'] || '',
      effectiveDirective: report['effective-directive'] || '',
      originalPolicy: report['original-policy'] || '',
      referrer: report.referrer,
      scriptSample: report['script-sample'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number'],
      statusCode: report['status-code'],
      violatedDirective: report['violated-directive'] || ''
    };
  } catch (error) {
    return null;
  }
}

/**
 * Common CSP configurations by use case
 */
export const CSP_USE_CASES = {
  dashboard: {
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https:"],
    fontSrc: ["'self'", "https:", "data:"],
    frameAncestors: ["'self'"]
  },
  
  api: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
    objectSrc: ["'none'"]
  },
  
  spa: {
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https:", "wss:"],
    fontSrc: ["'self'", "https:"],
    frameAncestors: ["'self'"],
    objectSrc: ["'none'"]
  },
  
  embedded: {
    frameAncestors: ["*"], // Allow embedding everywhere
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"]
  }
};

/**
 * Auto-detect appropriate CSP configuration based on request
 */
export function detectCspConfig(req: any): CspConfig {
  const _userAgent = req.headers['user-agent'] || '';
  const path = req.url || req.path || '';
  
  // API endpoints
  if (path.startsWith('/api/') || path.startsWith('/admin/')) {
    return CSP_USE_CASES.api;
  }
  
  // Dashboard/admin interface
  if (path.includes('dashboard') || path.includes('admin')) {
    return CSP_USE_CASES.dashboard;
  }
  
  // Embedded content (iframe)
  if (req.headers['sec-fetch-dest'] === 'iframe') {
    return CSP_USE_CASES.embedded;
  }
  
  // Default SPA configuration
  return CSP_USE_CASES.spa;
}