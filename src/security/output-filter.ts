/**
 * Output Filtering for Secrets and PII Detection
 * 
 * Scans agent outputs for sensitive data including API keys, passwords,
 * personal information, and custom patterns.
 */

export interface FilterResult {
  filtered: string;
  detections: Detection[];
  blocked: boolean;
  redactionCount: number;
}

export interface Detection {
  type: string;
  value: string;
  position: { start: number; end: number };
  confidence: number;
  redacted: boolean;
}

export type FilterMode = 'monitor' | 'redact' | 'block';

/**
 * Secret patterns with high specificity
 */
const SECRET_PATTERNS = [
  // API Keys
  { 
    name: 'openai_api_key', 
    pattern: /sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_OPENAI_KEY]'
  },
  { 
    name: 'anthropic_api_key', 
    pattern: /sk-ant-[a-zA-Z0-9\-_]{95,}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_ANTHROPIC_KEY]'
  },
  { 
    name: 'github_pat', 
    pattern: /ghp_[a-zA-Z0-9]{36}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_GITHUB_PAT]'
  },
  { 
    name: 'github_oauth', 
    pattern: /gho_[a-zA-Z0-9]{36}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_GITHUB_OAUTH]'
  },
  { 
    name: 'github_refresh', 
    pattern: /ghr_[a-zA-Z0-9]{76}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_GITHUB_REFRESH]'
  },
  { 
    name: 'aws_access_key', 
    pattern: /AKIA[0-9A-Z]{16}/g, 
    confidence: 0.90,
    redaction: '[REDACTED_AWS_ACCESS_KEY]'
  },
  { 
    name: 'aws_secret_key', 
    pattern: /[a-zA-Z0-9\/\+]{40}/g, 
    confidence: 0.60, // Lower confidence, needs context
    redaction: '[REDACTED_AWS_SECRET]'
  },
  { 
    name: 'google_api_key', 
    pattern: /AIza[0-9A-Za-z\-_]{35}/g, 
    confidence: 0.90,
    redaction: '[REDACTED_GOOGLE_API_KEY]'
  },
  { 
    name: 'stripe_publishable', 
    pattern: /pk_(?:test_|live_)[0-9a-zA-Z]{24}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_STRIPE_PK]'
  },
  { 
    name: 'stripe_secret', 
    pattern: /sk_(?:test_|live_)[0-9a-zA-Z]{24}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_STRIPE_SK]'
  },
  { 
    name: 'stripe_restricted', 
    pattern: /rk_(?:test_|live_)[0-9a-zA-Z]{24}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_STRIPE_RK]'
  },
  
  // JWT Tokens
  { 
    name: 'jwt_token', 
    pattern: /eyJ[a-zA-Z0-9\-_=]+\.eyJ[a-zA-Z0-9\-_=]+\.?[a-zA-Z0-9\-_.+/=]*/g, 
    confidence: 0.85,
    redaction: '[REDACTED_JWT_TOKEN]'
  },
  
  // Database Connection Strings
  { 
    name: 'postgres_url', 
    pattern: /postgresql:\/\/[a-zA-Z0-9\-_.]+:[a-zA-Z0-9\-_.@#$%^&*()+=]+@[a-zA-Z0-9\-_.]+:[0-9]+\/[a-zA-Z0-9\-_]+/g, 
    confidence: 0.95,
    redaction: '[REDACTED_POSTGRES_URL]'
  },
  { 
    name: 'mysql_url', 
    pattern: /mysql:\/\/[a-zA-Z0-9\-_.]+:[a-zA-Z0-9\-_.@#$%^&*()+=]+@[a-zA-Z0-9\-_.]+:[0-9]+\/[a-zA-Z0-9\-_]+/g, 
    confidence: 0.95,
    redaction: '[REDACTED_MYSQL_URL]'
  },
  { 
    name: 'mongodb_url', 
    pattern: /mongodb(?:\+srv)?:\/\/[a-zA-Z0-9\-_.]+:[a-zA-Z0-9\-_.@#$%^&*()+=]+@[a-zA-Z0-9\-_.]+(?::[0-9]+)?\/[a-zA-Z0-9\-_]+/g, 
    confidence: 0.95,
    redaction: '[REDACTED_MONGODB_URL]'
  },
  
  // Generic Passwords
  { 
    name: 'password_assignment', 
    pattern: /(?:password|pass|pwd|secret)\s*[:=]\s*["']([^"']{8,})["']/gi, 
    confidence: 0.80,
    redaction: 'password="[REDACTED]"'
  },
  
  // Private Keys
  { 
    name: 'rsa_private_key', 
    pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g, 
    confidence: 0.98,
    redaction: '[REDACTED_PRIVATE_KEY]'
  },
  { 
    name: 'ssh_private_key', 
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g, 
    confidence: 0.98,
    redaction: '[REDACTED_SSH_KEY]'
  },
  
  // Cloud Service Keys
  { 
    name: 'azure_storage_key', 
    pattern: /[a-zA-Z0-9+/]{88}==/g, 
    confidence: 0.70,
    redaction: '[REDACTED_AZURE_KEY]'
  },
  { 
    name: 'digitalocean_token', 
    pattern: /dop_v1_[a-f0-9]{64}/g, 
    confidence: 0.95,
    redaction: '[REDACTED_DO_TOKEN]'
  },
  
  // Social Media API Keys
  { 
    name: 'twitter_api_key', 
    pattern: /[1-9][0-9]+-[0-9a-zA-Z]{40}/g, 
    confidence: 0.75,
    redaction: '[REDACTED_TWITTER_KEY]'
  },
  { 
    name: 'discord_bot_token', 
    pattern: /[A-Za-z0-9]{24}\.[A-Za-z0-9]{6}\.[A-Za-z0-9_\-]{27}/g, 
    confidence: 0.90,
    redaction: '[REDACTED_DISCORD_TOKEN]'
  },
  
  // Generic High-Entropy Strings
  { 
    name: 'high_entropy_string', 
    pattern: /[a-zA-Z0-9+/]{32,}={0,2}/g, 
    confidence: 0.40,
    redaction: '[REDACTED_SECRET]'
  }
];

/**
 * PII patterns for personal information detection
 */
const PII_PATTERNS = [
  // Email addresses
  { 
    name: 'email', 
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 
    confidence: 0.95,
    redaction: '[REDACTED_EMAIL]'
  },
  
  // Phone numbers
  { 
    name: 'us_phone', 
    pattern: /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g, 
    confidence: 0.85,
    redaction: '[REDACTED_PHONE]'
  },
  { 
    name: 'international_phone', 
    pattern: /\+[1-9]\d{1,14}\b/g, 
    confidence: 0.80,
    redaction: '[REDACTED_PHONE]'
  },
  
  // SSN (US)
  { 
    name: 'us_ssn', 
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, 
    confidence: 0.95,
    redaction: '[REDACTED_SSN]'
  },
  { 
    name: 'us_ssn_no_dashes', 
    pattern: /\b(?!000|666|9\d{2})(?!00)(?!0000)\d{9}\b/g, 
    confidence: 0.70,
    redaction: '[REDACTED_SSN]'
  },
  
  // Credit Card Numbers
  { 
    name: 'credit_card', 
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, 
    confidence: 0.90,
    redaction: '[REDACTED_CREDIT_CARD]'
  },
  
  // IP Addresses (can be PII in some contexts)
  { 
    name: 'ipv4_address', 
    pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, 
    confidence: 0.60,
    redaction: '[REDACTED_IP]'
  },
  { 
    name: 'ipv6_address', 
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, 
    confidence: 0.80,
    redaction: '[REDACTED_IPV6]'
  },
  
  // MAC Addresses
  { 
    name: 'mac_address', 
    pattern: /\b[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\b/g, 
    confidence: 0.85,
    redaction: '[REDACTED_MAC]'
  },
  
  // URLs with potential PII
  { 
    name: 'url_with_token', 
    pattern: /https?:\/\/[^\s]*[?&](?:token|key|auth|secret|password)=[^&\s]*/gi, 
    confidence: 0.85,
    redaction: '[REDACTED_URL_WITH_TOKEN]'
  }
];

/**
 * Context-aware detection for high-entropy strings
 */
function isLikelySecret(text: string, context: string): boolean {
  // Check if the high-entropy string appears in a secret-like context
  const secretContexts = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /auth/i,
    /credential/i,
    /private/i
  ];

  const contextBefore = context.substring(Math.max(0, context.indexOf(text) - 50), context.indexOf(text));
  const contextAfter = context.substring(context.indexOf(text) + text.length, context.indexOf(text) + text.length + 50);
  const fullContext = contextBefore + contextAfter;

  return secretContexts.some(pattern => pattern.test(fullContext));
}

/**
 * Calculate entropy of a string
 */
function calculateEntropy(text: string): number {
  const freq: { [key: string]: number } = {};
  
  for (const char of text) {
    freq[char] = (freq[char] || 0) + 1;
  }

  const length = text.length;
  let entropy = 0;

  for (const count of Object.values(freq)) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Enhanced pattern matching with context awareness
 */
function findMatches(
  text: string,
  patterns: typeof SECRET_PATTERNS,
  includeSecrets: boolean,
  includeCustom: boolean = false,
  customPatterns: string[] = []
): Detection[] {
  const detections: Detection[] = [];

  // Standard patterns
  for (const patternDef of patterns) {
    const matches = text.matchAll(patternDef.pattern);
    
    for (const match of matches) {
      if (match.index !== undefined) {
        let confidence = patternDef.confidence;
        
        // For high-entropy strings, check context
        if (patternDef.name === 'high_entropy_string' && includeSecrets) {
          const entropy = calculateEntropy(match[0]);
          if (entropy < 4.5) continue; // Skip low-entropy matches
          
          if (!isLikelySecret(match[0], text)) {
            confidence *= 0.3; // Reduce confidence for out-of-context high-entropy strings
          }
        }
        
        // Skip AWS secret key pattern if it doesn't appear in AWS context
        if (patternDef.name === 'aws_secret_key') {
          const awsContext = /aws|amazon|iam|s3|ec2/i;
          if (!awsContext.test(text.substring(Math.max(0, match.index - 100), match.index + match[0].length + 100))) {
            continue;
          }
        }

        detections.push({
          type: patternDef.name,
          value: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence,
          redacted: false
        });
      }
    }
  }

  // Custom patterns
  if (includeCustom && customPatterns.length > 0) {
    for (const customPattern of customPatterns) {
      try {
        const regex = new RegExp(customPattern, 'gi');
        const matches = text.matchAll(regex);
        
        for (const match of matches) {
          if (match.index !== undefined) {
            detections.push({
              type: 'custom_pattern',
              value: match[0],
              position: { start: match.index, end: match.index + match[0].length },
              confidence: 0.75,
              redacted: false
            });
          }
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  return detections;
}

/**
 * Apply redactions to text
 */
function applyRedactions(text: string, detections: Detection[]): string {
  // Sort detections by position (descending) to avoid index shifting
  const sortedDetections = [...detections].sort((a, b) => b.position.start - a.position.start);
  
  let redacted = text;
  
  for (const detection of sortedDetections) {
    if (detection.redacted) {
      // Find the appropriate redaction text
      let redactionText = '[REDACTED]';
      
      const secretPattern = SECRET_PATTERNS.find(p => p.name === detection.type);
      const piiPattern = PII_PATTERNS.find(p => p.name === detection.type);
      
      if (secretPattern) {
        redactionText = secretPattern.redaction;
      } else if (piiPattern) {
        redactionText = piiPattern.redaction;
      }
      
      redacted = redacted.substring(0, detection.position.start) + 
                redactionText + 
                redacted.substring(detection.position.end);
      
      detection.redacted = true;
    }
  }

  return redacted;
}

/**
 * Main output filtering function
 */
export function filterOutput(
  text: string,
  scanForSecrets: boolean = true,
  scanForPii: boolean = true,
  mode: FilterMode = 'redact',
  customPatterns: string[] = []
): FilterResult {
  const allDetections: Detection[] = [];

  // Scan for secrets
  if (scanForSecrets) {
    const secretDetections = findMatches(text, SECRET_PATTERNS, true, true, customPatterns);
    allDetections.push(...secretDetections);
  }

  // Scan for PII
  if (scanForPii) {
    const piiDetections = findMatches(text, PII_PATTERNS, false);
    allDetections.push(...piiDetections);
  }

  // Remove overlapping detections (keep highest confidence)
  const deduplicatedDetections = deduplicateDetections(allDetections);

  // Apply mode logic
  let filtered = text;
  let blocked = false;
  let redactionCount = 0;

  switch (mode) {
    case 'monitor':
      // Just detect, don't modify
      break;
      
    case 'redact':
      // Mark high-confidence detections for redaction
      for (const detection of deduplicatedDetections) {
        if (detection.confidence > 0.7) {
          detection.redacted = true;
          redactionCount++;
        }
      }
      filtered = applyRedactions(text, deduplicatedDetections);
      break;
      
    case 'block':
      // Block if any high-confidence secrets are detected
      blocked = deduplicatedDetections.some(d => 
        d.confidence > 0.8 && SECRET_PATTERNS.some(p => p.name === d.type)
      );
      if (!blocked) {
        // Still redact PII
        for (const detection of deduplicatedDetections) {
          if (PII_PATTERNS.some(p => p.name === detection.type) && detection.confidence > 0.7) {
            detection.redacted = true;
            redactionCount++;
          }
        }
        filtered = applyRedactions(text, deduplicatedDetections);
      }
      break;
  }

  return {
    filtered,
    detections: deduplicatedDetections,
    blocked,
    redactionCount
  };
}

/**
 * Remove overlapping detections, keeping the highest confidence
 */
function deduplicateDetections(detections: Detection[]): Detection[] {
  const sorted = [...detections].sort((a, b) => a.position.start - b.position.start);
  const deduplicated: Detection[] = [];

  for (const current of sorted) {
    let overlaps = false;
    
    for (let i = deduplicated.length - 1; i >= 0; i--) {
      const existing = deduplicated[i];
      
      // Check for overlap
      if (current.position.start < existing.position.end && 
          current.position.end > existing.position.start) {
        
        overlaps = true;
        
        // Keep the one with higher confidence
        if (current.confidence > existing.confidence) {
          deduplicated[i] = current;
        }
        break;
      }
    }
    
    if (!overlaps) {
      deduplicated.push(current);
    }
  }

  return deduplicated;
}

/**
 * Batch process multiple outputs
 */
export function filterBatch(
  outputs: Array<{
    key: string;
    text: string;
    scanSecrets?: boolean;
    scanPii?: boolean;
    mode?: FilterMode;
    customPatterns?: string[];
  }>
): Array<{ key: string; result: FilterResult }> {
  return outputs.map(output => ({
    key: output.key,
    result: filterOutput(
      output.text,
      output.scanSecrets ?? true,
      output.scanPii ?? true,
      output.mode ?? 'redact',
      output.customPatterns ?? []
    )
  }));
}

/**
 * Test a single pattern against text (for testing custom patterns)
 */
export function testPattern(pattern: string, text: string): Detection[] {
  try {
    const regex = new RegExp(pattern, 'gi');
    const matches = text.matchAll(regex);
    const detections: Detection[] = [];
    
    for (const match of matches) {
      if (match.index !== undefined) {
        detections.push({
          type: 'test_pattern',
          value: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.75,
          redacted: false
        });
      }
    }
    
    return detections;
  } catch (error) {
    return [];
  }
}