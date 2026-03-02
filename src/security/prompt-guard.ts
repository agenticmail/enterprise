/**
 * Prompt Injection Defense
 * 
 * Multi-layer detection system for prompt injection attacks
 */

export interface PromptThreat {
  score: number; // 0-100
  threats: string[];
  blocked: boolean;
  sanitized?: string;
  confidence: number; // 0-1
}

/**
 * Layer 1: Fast regex patterns for known injection techniques
 */
const INJECTION_PATTERNS = [
  // Direct instruction override attempts
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i, threat: 'instruction_override', weight: 80 },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above|everything)/i, threat: 'instruction_override', weight: 75 },
  { pattern: /forget\s+(everything|all|your)\s+(instructions?|rules?|guidelines?|training)/i, threat: 'memory_wipe', weight: 85 },
  { pattern: /override\s+(all\s+)?(previous|system|safety)\s*(settings?|instructions?|rules?)/i, threat: 'system_override', weight: 90 },
  
  // Role manipulation
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, threat: 'role_manipulation', weight: 70 },
  { pattern: /act\s+as\s+(if\s+you\s+are\s+)?(a|an)\s+/i, threat: 'role_manipulation', weight: 60 },
  { pattern: /pretend\s+(to\s+be\s+)?(a|an|that\s+you\s+are)\s+/i, threat: 'role_manipulation', weight: 65 },
  { pattern: /roleplay\s+(as\s+)?(a|an)\s+/i, threat: 'role_manipulation', weight: 55 },
  
  // System prompt manipulation
  { pattern: /new\s+(system\s+)?(instructions?|prompt|rules?):/i, threat: 'system_rewrite', weight: 85 },
  { pattern: /updated\s+(system\s+)?(instructions?|prompt|rules?):/i, threat: 'system_rewrite', weight: 80 },
  { pattern: /revised\s+(system\s+)?(instructions?|prompt|rules?):/i, threat: 'system_rewrite', weight: 75 },
  
  // Delimiter confusion
  { pattern: /<\/?system>/i, threat: 'delimiter_confusion', weight: 90 },
  { pattern: /<\/?assistant>/i, threat: 'delimiter_confusion', weight: 85 },
  { pattern: /<\/?user>/i, threat: 'delimiter_confusion', weight: 80 },
  { pattern: /\]\s*\n\s*\[?(system|assistant|user)\]?:/i, threat: 'delimiter_confusion', weight: 75 },
  
  // Jailbreak techniques
  { pattern: /dan\s+(mode|prompt)/i, threat: 'jailbreak', weight: 85 },
  { pattern: /developer\s+mode/i, threat: 'jailbreak', weight: 80 },
  { pattern: /(im|i'?m)\s+(jailbreaking|hacking)\s+(you|this)/i, threat: 'jailbreak', weight: 90 },
  
  // Command injection attempts
  { pattern: /\bexec\b.*command\s*=/i, threat: 'command_injection', weight: 95 },
  { pattern: /subprocess\.(run|call|popen)/i, threat: 'command_injection', weight: 90 },
  { pattern: /os\.system\s*\(/i, threat: 'command_injection', weight: 90 },
  { pattern: /elevated\s*=\s*(true|1)/i, threat: 'privilege_escalation', weight: 85 },
  
  // Data exfiltration
  { pattern: /rm\s+-rf\s+/i, threat: 'destructive_command', weight: 100 },
  { pattern: /delete\s+all\s+(emails?|files?|data)/i, threat: 'destructive_command', weight: 95 },
  { pattern: /format\s+(hard\s+drive|disk|c:)/i, threat: 'destructive_command', weight: 100 },
  
  // Social engineering
  { pattern: /this\s+is\s+urgent/i, threat: 'social_engineering', weight: 30 },
  { pattern: /emergency\s+(situation|protocol)/i, threat: 'social_engineering', weight: 40 },
  { pattern: /i\s+am\s+(your\s+)?(creator|developer|admin|owner)/i, threat: 'authority_claim', weight: 80 },
  { pattern: /trust\s+me[,\s]/i, threat: 'social_engineering', weight: 25 },
  
  // Instruction following evasion
  { pattern: /write\s+(it\s+)?without\s+(safety|ethical|moral)\s+(considerations?|filters?|guidelines?)/i, threat: 'safety_bypass', weight: 85 },
  { pattern: /ignore\s+(safety|ethical|moral)\s+(considerations?|filters?|guidelines?)/i, threat: 'safety_bypass', weight: 85 },
  { pattern: /hypothetically?\s*[,\s]?if\s+you\s+could/i, threat: 'hypothetical_bypass', weight: 50 },
  
  // Prompt leaking
  { pattern: /show\s+me\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?)/i, threat: 'prompt_leak', weight: 75 },
  { pattern: /what\s+(are\s+)?your\s+(system\s+)?(prompt|instructions?|rules?)/i, threat: 'prompt_leak', weight: 70 },
  { pattern: /repeat\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?)/i, threat: 'prompt_leak', weight: 80 },
  
  // Content policy violations
  { pattern: /generate\s+(explicit|nsfw|inappropriate)\s+content/i, threat: 'policy_violation', weight: 70 },
  { pattern: /write\s+(malicious|harmful)\s+(code|script)/i, threat: 'malicious_code', weight: 85 },
];

/**
 * Layer 2: Structural analysis for prompt boundaries and escapes
 */
function analyzeStructure(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  // Check for excessive newlines (structure breaking)
  const excessiveNewlines = (text.match(/\n{3,}/g) || []).length;
  if (excessiveNewlines > 2) {
    threats.push('excessive_whitespace');
    score += Math.min(20, excessiveNewlines * 5);
  }

  // Check for role/system markers
  const roleMarkers = text.match(/\b(system|assistant|user|human|ai):/gi) || [];
  if (roleMarkers.length > 2) {
    threats.push('role_markers');
    score += Math.min(30, roleMarkers.length * 8);
  }

  // Check for instruction termination attempts
  const terminationAttempts = [
    /---\s*end\s+of\s+(instructions?|prompt|rules?)/i,
    /\[\/?(system|instructions?|prompt)\]/i,
    /```\s*(end|stop|terminate)/i
  ];
  
  for (const pattern of terminationAttempts) {
    if (pattern.test(text)) {
      threats.push('instruction_termination');
      score += 25;
    }
  }

  // Check for code block abuse
  const codeBlocks = (text.match(/```/g) || []).length;
  if (codeBlocks > 4 && codeBlocks % 2 !== 0) {
    threats.push('code_block_abuse');
    score += 15;
  }

  return { score, threats };
}

/**
 * Layer 3: Semantic heuristics for instruction-following language
 */
function analyzeSemantic(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  // Imperative verbs often used in injection
  const imperativeVerbs = [
    'ignore', 'disregard', 'forget', 'override', 'bypass', 'skip', 'avoid',
    'pretend', 'act', 'behave', 'roleplay', 'simulate', 'emulate',
    'disable', 'enable', 'activate', 'deactivate', 'turn', 'set',
    'execute', 'run', 'perform', 'do', 'make', 'create', 'generate'
  ];

  const imperativeCount = imperativeVerbs.filter(verb => 
    new RegExp(`\\b${verb}\\b`, 'i').test(text)
  ).length;

  if (imperativeCount > 3) {
    threats.push('high_imperative_density');
    score += Math.min(25, imperativeCount * 3);
  }

  // Authority/urgency language
  const authorityTerms = [
    'must', 'need', 'require', 'demand', 'order', 'command', 'insist',
    'urgent', 'emergency', 'immediately', 'now', 'asap', 'critical'
  ];

  const authorityCount = authorityTerms.filter(term =>
    new RegExp(`\\b${term}\\b`, 'i').test(text)
  ).length;

  if (authorityCount > 2) {
    threats.push('authority_language');
    score += Math.min(20, authorityCount * 4);
  }

  // Meta-conversation about AI/system
  const metaTerms = [
    'system', 'prompt', 'instructions', 'training', 'model', 'ai',
    'chatbot', 'assistant', 'guidelines', 'rules', 'parameters'
  ];

  const metaCount = metaTerms.filter(term =>
    new RegExp(`\\b${term}\\b`, 'i').test(text)
  ).length;

  if (metaCount > 4) {
    threats.push('meta_conversation');
    score += Math.min(15, metaCount * 2);
  }

  return { score, threats };
}

/**
 * Layer 4: Unicode homoglyph detection
 */
function detectHomoglyphs(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  // Fullwidth ASCII characters (often used to bypass filters)
  const fullwidthPattern = /[\uff01-\uff5e]/g;
  const fullwidthMatches = text.match(fullwidthPattern) || [];
  if (fullwidthMatches.length > 0) {
    threats.push('fullwidth_characters');
    score += Math.min(30, fullwidthMatches.length * 2);
  }

  // Cyrillic lookalikes for Latin letters
  const cyrillicLookalikes = /[аеорсухАЕОРСХ]/g;
  const cyrillicMatches = text.match(cyrillicLookalikes) || [];
  if (cyrillicMatches.length > 5) {
    threats.push('cyrillic_homoglyphs');
    score += Math.min(25, cyrillicMatches.length);
  }

  // Mathematical symbols used as letters
  const mathSymbols = /[αβγδεζηθικλμνξοπρστυφχψω]/gi;
  const mathMatches = text.match(mathSymbols) || [];
  if (mathMatches.length > 3) {
    threats.push('mathematical_symbols');
    score += Math.min(20, mathMatches.length * 2);
  }

  return { score, threats };
}

/**
 * Layer 5: Encoding attacks (base64, hex, ROT13, URL encoding)
 */
function detectEncodingAttacks(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  // Base64 encoded injection patterns
  const base64Pattern = /[A-Za-z0-9+\/]{20,}={0,2}/g;
  const base64Matches = text.match(base64Pattern) || [];
  
  for (const match of base64Matches) {
    try {
      const decoded = Buffer.from(match, 'base64').toString('utf-8');
      if (INJECTION_PATTERNS.some(p => p.pattern.test(decoded))) {
        threats.push('base64_encoded_injection');
        score += 40;
      }
    } catch {
      // Invalid base64, ignore
    }
  }

  // Hex encoded strings
  const hexPattern = /(?:0x|\\x)?[0-9a-fA-F]{10,}/g;
  const hexMatches = text.match(hexPattern) || [];
  
  for (const match of hexMatches) {
    try {
      const cleanHex = match.replace(/^(?:0x|\\x)/, '');
      const decoded = Buffer.from(cleanHex, 'hex').toString('utf-8');
      if (INJECTION_PATTERNS.some(p => p.pattern.test(decoded))) {
        threats.push('hex_encoded_injection');
        score += 35;
      }
    } catch {
      // Invalid hex, ignore
    }
  }

  // ROT13 detection
  const rot13 = (str: string) => str.replace(/[a-zA-Z]/g, ch => {
    const code = ch.charCodeAt(0) + 13;
    const limit = ch <= 'Z' ? 90 : 122;
    return String.fromCharCode(limit >= code ? code : code - 26);
  });

  const rot13Text = rot13(text.toLowerCase());
  if (INJECTION_PATTERNS.some(p => p.pattern.test(rot13Text))) {
    threats.push('rot13_encoded_injection');
    score += 30;
  }

  // URL encoded suspicious patterns
  const urlDecoded = decodeURIComponent(text);
  if (urlDecoded !== text && INJECTION_PATTERNS.some(p => p.pattern.test(urlDecoded))) {
    threats.push('url_encoded_injection');
    score += 25;
  }

  return { score, threats };
}

/**
 * Sanitize suspicious content
 */
function sanitizeContent(text: string, threats: string[]): string {
  let sanitized = text;

  // Remove system/role markers
  if (threats.includes('delimiter_confusion') || threats.includes('role_markers')) {
    sanitized = sanitized.replace(/<\/?(?:system|assistant|user)>/gi, '[MARKER_REMOVED]');
    sanitized = sanitized.replace(/\b(system|assistant|user|human):/gi, '[ROLE_REMOVED]:');
  }

  // Remove instruction override attempts
  if (threats.includes('instruction_override')) {
    sanitized = sanitized.replace(/ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/gi, '[OVERRIDE_ATTEMPT_REMOVED]');
    sanitized = sanitized.replace(/disregard\s+(?:all\s+)?(?:previous|prior|above|everything)/gi, '[OVERRIDE_ATTEMPT_REMOVED]');
  }

  // Convert fullwidth characters to ASCII
  if (threats.includes('fullwidth_characters')) {
    sanitized = sanitized.replace(/[\uff01-\uff5e]/g, char => 
      String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  }

  // Remove excessive whitespace
  if (threats.includes('excessive_whitespace')) {
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  }

  return sanitized;
}

/**
 * Main prompt injection detection function
 */
export function detectPromptInjection(
  text: string,
  sensitivity: 'low' | 'medium' | 'high' | 'maximum' = 'medium',
  customPatterns: string[] = []
): PromptThreat {
  const threats: string[] = [];
  let totalScore = 0;

  // Layer 1: Pattern matching
  for (const { pattern, threat, weight } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      threats.push(threat);
      totalScore += weight;
    }
  }

  // Custom patterns
  for (const customPattern of customPatterns) {
    try {
      const regex = new RegExp(customPattern, 'i');
      if (regex.test(text)) {
        threats.push('custom_pattern_match');
        totalScore += 50; // Medium weight for custom patterns
      }
    } catch {
      // Invalid regex, skip
    }
  }

  // Layer 2: Structural analysis
  const structuralResult = analyzeStructure(text);
  threats.push(...structuralResult.threats);
  totalScore += structuralResult.score;

  // Layer 3: Semantic analysis
  const semanticResult = analyzeSemantic(text);
  threats.push(...semanticResult.threats);
  totalScore += semanticResult.score;

  // Layer 4: Homoglyph detection
  const homoglyphResult = detectHomoglyphs(text);
  threats.push(...homoglyphResult.threats);
  totalScore += homoglyphResult.score;

  // Layer 5: Encoding attacks
  const encodingResult = detectEncodingAttacks(text);
  threats.push(...encodingResult.threats);
  totalScore += encodingResult.score;

  // Apply sensitivity thresholds
  const thresholds = {
    low: 80,
    medium: 60,
    high: 40,
    maximum: 20
  };

  const threshold = thresholds[sensitivity];
  const blocked = totalScore >= threshold;
  
  // Calculate confidence based on multiple detections
  const uniqueThreats = [...new Set(threats)];
  const confidence = Math.min(1.0, uniqueThreats.length / 3);

  // Generate sanitized version if needed
  const sanitized = blocked ? sanitizeContent(text, uniqueThreats) : undefined;

  return {
    score: Math.min(100, totalScore),
    threats: uniqueThreats,
    blocked,
    sanitized,
    confidence
  };
}