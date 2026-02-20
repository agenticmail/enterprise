import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-code-sandbox',
  name: 'Code Sandbox',
  description: 'Execute code snippets in isolated sandboxes for data transformation, calculations, and automation scripts. Supports JavaScript/TypeScript, Python, and shell commands with memory and time limits.',
  category: 'automation',
  risk: 'high',
  icon: '⚡',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_code_run_js',
    name: 'Run JavaScript',
    description: 'Execute JavaScript/TypeScript code in an isolated V8 sandbox. Has access to standard library (JSON, Math, Date, crypto, Buffer) but no filesystem or network access. Returns the last expression value.',
    category: 'execute',
    risk: 'medium',
    skillId: 'enterprise-code-sandbox',
    sideEffects: ['runs-code'],
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
        input: { type: 'object', description: 'Input data available as the "input" variable in the code' },
        timeout: { type: 'number', description: 'Execution timeout in milliseconds', default: 10000 },
        memoryLimit: { type: 'number', description: 'Memory limit in MB', default: 128 },
      },
      required: ['code'],
    },
  },
  {
    id: 'ent_code_run_python',
    name: 'Run Python',
    description: 'Execute Python code in an isolated sandbox. Has access to standard library (json, math, datetime, re, csv, collections, itertools) but restricted filesystem and network access.',
    category: 'execute',
    risk: 'medium',
    skillId: 'enterprise-code-sandbox',
    sideEffects: ['runs-code'],
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
        input: { type: 'object', description: 'Input data available as the "input" dict' },
        packages: { type: 'array', items: { type: 'string' }, description: 'Additional pip packages to install (from approved list)' },
        timeout: { type: 'number', default: 30000 },
      },
      required: ['code'],
    },
  },
  {
    id: 'ent_code_run_shell',
    name: 'Run Shell Command',
    description: 'Execute a shell command in an isolated environment. Restricted to read-only filesystem access and approved commands. Dangerous commands (rm, dd, mkfs, etc.) are blocked.',
    category: 'execute',
    risk: 'high',
    skillId: 'enterprise-code-sandbox',
    sideEffects: ['runs-code'],
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        workingDir: { type: 'string', description: 'Working directory' },
        env: { type: 'object', description: 'Environment variables' },
        timeout: { type: 'number', default: 30000 },
        stdin: { type: 'string', description: 'Standard input data' },
      },
      required: ['command'],
    },
  },
  {
    id: 'ent_code_transform_json',
    name: 'Transform JSON',
    description: 'Apply a JMESPath or JSONPath expression to transform JSON data. Useful for reshaping API responses, extracting nested values, and data mapping.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-code-sandbox',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'object', description: 'Input JSON data' },
        expression: { type: 'string', description: 'JMESPath or JSONPath expression' },
        language: { type: 'string', enum: ['jmespath', 'jsonpath'], default: 'jmespath' },
      },
      required: ['data', 'expression'],
    },
  },
  {
    id: 'ent_code_regex',
    name: 'Regex Operations',
    description: 'Apply regex operations to text: match, find all, replace, split, extract named groups. Includes regex validation and explanation.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-code-sandbox',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to process' },
        pattern: { type: 'string', description: 'Regex pattern' },
        operation: { type: 'string', enum: ['match', 'find_all', 'replace', 'split', 'extract'], default: 'find_all' },
        replacement: { type: 'string', description: 'Replacement string (for replace operation)' },
        flags: { type: 'string', description: 'Regex flags (e.g., "gi" for global case-insensitive)' },
      },
      required: ['text', 'pattern'],
    },
  },
];
