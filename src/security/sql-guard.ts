/**
 * SQL Injection Detection
 * 
 * Comprehensive SQL injection detection for tool inputs and API requests
 */

export interface SqlThreat {
  score: number; // 0-100
  threats: string[];
  blocked: boolean;
  confidence: number;
}

/**
 * SQL injection patterns with threat classification and weights
 */
const SQL_INJECTION_PATTERNS = [
  // Union-based injection
  { pattern: /\bunion\s+(all\s+)?select\b/i, threat: 'union_select', weight: 90 },
  { pattern: /\bunion\s+(all\s+)?\(/i, threat: 'union_subquery', weight: 85 },
  
  // Classic tautologies
  { pattern: /\b1\s*=\s*1\b/, threat: 'tautology', weight: 80 },
  { pattern: /\b1\s*=\s*true\b/i, threat: 'tautology', weight: 80 },
  { pattern: /\b'?\s*or\s+'?\s*'?\s*=\s*'?\s*'/i, threat: 'tautology', weight: 85 },
  { pattern: /\b'?\s*or\s+'?\s*1\s*=\s*1\s*'?/i, threat: 'tautology', weight: 90 },
  { pattern: /\b'?\s*or\s+'?\s*true\s*'?/i, threat: 'tautology', weight: 80 },
  
  // Boolean-based blind injection
  { pattern: /\band\s+\d+\s*=\s*\d+/i, threat: 'boolean_blind', weight: 70 },
  { pattern: /\bor\s+\d+\s*=\s*\d+/i, threat: 'boolean_blind', weight: 75 },
  { pattern: /\band\s+\w+\s*=\s*\w+/i, threat: 'boolean_blind', weight: 60 },
  
  // Time-based blind injection
  { pattern: /\bwaitfor\s+delay\b/i, threat: 'time_based', weight: 95 },
  { pattern: /\bsleep\s*\(\s*\d+\s*\)/i, threat: 'time_based', weight: 95 },
  { pattern: /\bbenchmark\s*\(/i, threat: 'time_based', weight: 90 },
  { pattern: /\bpg_sleep\s*\(/i, threat: 'time_based', weight: 90 },
  
  // Stacked queries
  { pattern: /;\s*drop\s+table\b/i, threat: 'stacked_query_drop', weight: 100 },
  { pattern: /;\s*delete\s+from\b/i, threat: 'stacked_query_delete', weight: 100 },
  { pattern: /;\s*insert\s+into\b/i, threat: 'stacked_query_insert', weight: 95 },
  { pattern: /;\s*update\s+\w+\s+set\b/i, threat: 'stacked_query_update', weight: 95 },
  { pattern: /;\s*create\s+(table|database|user)\b/i, threat: 'stacked_query_create', weight: 90 },
  { pattern: /;\s*alter\s+(table|database)\b/i, threat: 'stacked_query_alter', weight: 85 },
  { pattern: /;\s*grant\s+/i, threat: 'stacked_query_grant', weight: 90 },
  
  // Comment-based injection
  { pattern: /\/\*.*?\*\//s, threat: 'multiline_comment', weight: 40 },
  { pattern: /--.*$/m, threat: 'single_comment', weight: 50 },
  { pattern: /#.*$/m, threat: 'hash_comment', weight: 45 },
  { pattern: /\/\*!\d+/i, threat: 'mysql_version_comment', weight: 60 },
  
  // Information schema queries
  { pattern: /\binformation_schema\b/i, threat: 'info_schema', weight: 80 },
  { pattern: /\bsys\.tables\b/i, threat: 'system_tables', weight: 85 },
  { pattern: /\bsys\.columns\b/i, threat: 'system_columns', weight: 85 },
  { pattern: /\bsysObjects\b/i, threat: 'sysobjects', weight: 80 },
  { pattern: /\bmysql\.user\b/i, threat: 'mysql_user', weight: 90 },
  
  // Function-based injection
  { pattern: /\bextractvalue\s*\(/i, threat: 'xml_function', weight: 85 },
  { pattern: /\bupdatexml\s*\(/i, threat: 'xml_function', weight: 85 },
  { pattern: /\bexp\s*\(\s*~\s*\(/i, threat: 'math_overflow', weight: 80 },
  { pattern: /\bconcat\s*\(/i, threat: 'concat_function', weight: 30 },
  { pattern: /\bchar\s*\(\s*\d+/i, threat: 'char_function', weight: 40 },
  { pattern: /\bascii\s*\(/i, threat: 'ascii_function', weight: 35 },
  { pattern: /\bsubstring\s*\(/i, threat: 'substring_function', weight: 25 },
  { pattern: /\blength\s*\(/i, threat: 'length_function', weight: 20 },
  
  // Database-specific functions
  { pattern: /\bversion\s*\(\s*\)/i, threat: 'version_function', weight: 70 },
  { pattern: /\buser\s*\(\s*\)/i, threat: 'user_function', weight: 65 },
  { pattern: /\bdatabase\s*\(\s*\)/i, threat: 'database_function', weight: 70 },
  { pattern: /\b@@version\b/i, threat: 'system_variable', weight: 75 },
  { pattern: /\b@@datadir\b/i, threat: 'system_variable', weight: 70 },
  { pattern: /\bdb_name\s*\(/i, threat: 'sqlserver_function', weight: 70 },
  
  // Stored procedure calls
  { pattern: /\bxp_cmdshell\b/i, threat: 'xp_cmdshell', weight: 100 },
  { pattern: /\bsp_oacreate\b/i, threat: 'sp_oacreate', weight: 95 },
  { pattern: /\bsp_makewebtask\b/i, threat: 'sp_makewebtask', weight: 90 },
  { pattern: /\bsp_addextendedproc\b/i, threat: 'sp_addextendedproc', weight: 95 },
  
  // Encoding/evasion techniques
  { pattern: /0x[0-9a-f]+/i, threat: 'hex_encoding', weight: 40 },
  { pattern: /\bcast\s*\(/i, threat: 'cast_function', weight: 30 },
  { pattern: /\bconvert\s*\(/i, threat: 'convert_function', weight: 30 },
  { pattern: /\bundeclared\s+/i, threat: 'undeclared_variable', weight: 50 },
  
  // Error-based injection
  { pattern: /\bcount\s*\(\s*\*\s*\)\s*from\b/i, threat: 'count_aggregate', weight: 40 },
  { pattern: /\bgroup\s+by\s+\d+/i, threat: 'group_by_number', weight: 45 },
  { pattern: /\bhaving\s+\d+\s*=\s*\d+/i, threat: 'having_condition', weight: 50 },
  { pattern: /\border\s+by\s+\d+/i, threat: 'order_by_number', weight: 35 },
  
  // File operations
  { pattern: /\binto\s+outfile\b/i, threat: 'into_outfile', weight: 90 },
  { pattern: /\binto\s+dumpfile\b/i, threat: 'into_dumpfile', weight: 95 },
  { pattern: /\bload_file\s*\(/i, threat: 'load_file', weight: 85 },
  { pattern: /\bbulk\s+insert\b/i, threat: 'bulk_insert', weight: 80 },
  
  // LDAP injection (often combined with SQL)
  { pattern: /\(\s*\|\s*\(\s*uid\s*=/i, threat: 'ldap_injection', weight: 70 },
  { pattern: /\(\s*&\s*\(\s*uid\s*=/i, threat: 'ldap_injection', weight: 70 },
  
  // NoSQL injection patterns
  { pattern: /\$where\s*:/i, threat: 'nosql_where', weight: 60 },
  { pattern: /\$gt\s*:\s*""?/i, threat: 'nosql_comparison', weight: 55 },
  { pattern: /\$ne\s*:\s*null/i, threat: 'nosql_comparison', weight: 55 },
  { pattern: /\$regex\s*:/i, threat: 'nosql_regex', weight: 50 }
];

/**
 * Context-specific weight modifiers
 */
const CONTEXT_MODIFIERS = {
  api_body: 1.2, // API request bodies are higher risk
  tool_args: 1.5, // Tool arguments are highest risk
  form_input: 1.0, // Form inputs baseline
  query_param: 0.8 // Query params are somewhat lower risk
};

/**
 * Analyze SQL structure for additional threats
 */
function analyzeStructure(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  // Check for multiple statements
  const statements = text.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    threats.push('multiple_statements');
    score += Math.min(30, statements.length * 8);
  }

  // Check for quote imbalances (common in injection)
  const singleQuotes = (text.match(/'/g) || []).length;
  const doubleQuotes = (text.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
    threats.push('quote_imbalance');
    score += 25;
  }

  // Check for suspicious parentheses patterns
  const parenMatches = text.match(/\([\s\w,]*\)/g) || [];
  if (parenMatches.length > 3) {
    threats.push('excessive_parentheses');
    score += Math.min(20, parenMatches.length * 3);
  }

  // Check for SQL keywords density
  const sqlKeywords = [
    'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'table', 'database', 'from', 'where', 'join', 'union', 'group',
    'order', 'having', 'limit', 'offset'
  ];
  
  const keywordCount = sqlKeywords.filter(keyword => 
    new RegExp(`\\b${keyword}\\b`, 'i').test(text)
  ).length;

  if (keywordCount > 4) {
    threats.push('high_sql_keyword_density');
    score += Math.min(25, keywordCount * 3);
  }

  return { score, threats };
}

/**
 * Detect character-level evasion techniques
 */
function detectEvasion(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  // URL encoding detection
  const urlEncodedChars = text.match(/%[0-9a-f]{2}/gi) || [];
  if (urlEncodedChars.length > 5) {
    threats.push('url_encoding_evasion');
    score += Math.min(20, urlEncodedChars.length * 2);
  }

  // Unicode evasion
  const unicodeEscapes = text.match(/\\u[0-9a-f]{4}/gi) || [];
  if (unicodeEscapes.length > 0) {
    threats.push('unicode_evasion');
    score += Math.min(15, unicodeEscapes.length * 5);
  }

  // Excessive whitespace (often used to evade detection)
  const whitespaceChunks = text.match(/\s{5,}/g) || [];
  if (whitespaceChunks.length > 0) {
    threats.push('whitespace_evasion');
    score += Math.min(10, whitespaceChunks.length * 3);
  }

  // Mixed case SQL keywords
  const mixedCaseKeywords = text.match(/\b[a-z]+[A-Z]+[a-z]*\b/g) || [];
  const sqlKeywordPattern = /\b(select|insert|update|delete|union|drop|create|alter)\b/i;
  const mixedCaseSql = mixedCaseKeywords.filter(word => sqlKeywordPattern.test(word));
  
  if (mixedCaseSql.length > 0) {
    threats.push('mixed_case_keywords');
    score += mixedCaseSql.length * 8;
  }

  return { score, threats };
}

/**
 * Check for database fingerprinting attempts
 */
function detectFingerprinting(text: string): { score: number; threats: string[] } {
  const threats: string[] = [];
  let score = 0;

  const fingerprintingPatterns = [
    /\b(mysql|postgresql|oracle|mssql|sqlite)\b/i,
    /\bversion\s*\(\s*\)/i,
    /\b@@version\b/i,
    /\bpg_version\s*\(\s*\)/i,
    /\boracle_version\b/i,
    /\bsqlite_version\s*\(\s*\)/i
  ];

  for (const pattern of fingerprintingPatterns) {
    if (pattern.test(text)) {
      threats.push('database_fingerprinting');
      score += 15;
      break; // Only count once per input
    }
  }

  return { score, threats };
}

/**
 * Main SQL injection detection function
 */
export function detectSqlInjection(
  text: string,
  context: 'api_body' | 'tool_args' | 'form_input' | 'query_param' = 'form_input'
): SqlThreat {
  const threats: string[] = [];
  let totalScore = 0;

  // Pattern matching
  for (const { pattern, threat, weight } of SQL_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      threats.push(threat);
      totalScore += weight;
    }
  }

  // Structural analysis
  const structuralResult = analyzeStructure(text);
  threats.push(...structuralResult.threats);
  totalScore += structuralResult.score;

  // Evasion technique detection
  const evasionResult = detectEvasion(text);
  threats.push(...evasionResult.threats);
  totalScore += evasionResult.score;

  // Fingerprinting detection
  const fingerprintingResult = detectFingerprinting(text);
  threats.push(...fingerprintingResult.threats);
  totalScore += fingerprintingResult.score;

  // Apply context modifier
  const contextModifier = CONTEXT_MODIFIERS[context] || 1.0;
  totalScore = Math.round(totalScore * contextModifier);

  // Determine if blocked (threshold of 60 for SQL injection)
  const blocked = totalScore >= 60;

  // Calculate confidence based on multiple threat types
  const uniqueThreats = [...new Set(threats)];
  const confidence = Math.min(1.0, uniqueThreats.length / 4);

  return {
    score: Math.min(100, totalScore),
    threats: uniqueThreats,
    blocked,
    confidence
  };
}

/**
 * Normalize SQL input for analysis (decode common encodings)
 */
export function normalizeSqlInput(text: string): string {
  let normalized = text;

  try {
    // URL decode
    normalized = decodeURIComponent(normalized);
  } catch {
    // Invalid URL encoding, continue
  }

  try {
    // HTML entity decode (basic ones)
    normalized = normalized
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  } catch {
    // Continue
  }

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Batch analyze multiple inputs for SQL injection
 */
export function analyzeBatch(
  inputs: Array<{ key: string; value: string; context?: 'api_body' | 'tool_args' | 'form_input' | 'query_param' }>
): Array<{ key: string; threat: SqlThreat }> {
  return inputs.map(input => ({
    key: input.key,
    threat: detectSqlInjection(
      normalizeSqlInput(input.value),
      input.context || 'form_input'
    )
  }));
}