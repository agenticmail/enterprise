import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-translation',
  name: 'Translation & Localization',
  description: 'Translate text, documents, and content between languages with enterprise terminology awareness. Supports translation memory, glossaries, and domain-specific translations (legal, medical, technical).',
  category: 'productivity',
  risk: 'low',
  icon: '🌍',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_translate_text',
    name: 'Translate Text',
    description: 'Translate text from one language to another. Supports 100+ language pairs with context-aware translation that preserves formatting and tone.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-translation',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to translate' },
        targetLanguage: { type: 'string', description: 'Target language code (e.g., "fr", "de", "ja", "zh", "es")' },
        sourceLanguage: { type: 'string', description: 'Source language (auto-detected if omitted)' },
        domain: { type: 'string', enum: ['general', 'legal', 'medical', 'technical', 'financial', 'marketing'], description: 'Translation domain for terminology', default: 'general' },
        formality: { type: 'string', enum: ['formal', 'informal', 'auto'], default: 'auto' },
        glossary: { type: 'object', description: 'Custom term mappings (e.g., {"AgenticMail": "AgenticMail"} to preserve brand names)' },
      },
      required: ['text', 'targetLanguage'],
    },
  },
  {
    id: 'ent_translate_document',
    name: 'Translate Document',
    description: 'Translate an entire document file while preserving formatting. Supports PDF, DOCX, HTML, TXT, and SRT subtitle files.',
    category: 'write',
    risk: 'medium',
    skillId: 'enterprise-translation',
    sideEffects: ['network-request', 'modifies-files'],
    parameters: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Input document path' },
        outputPath: { type: 'string', description: 'Output document path' },
        targetLanguage: { type: 'string' },
        sourceLanguage: { type: 'string' },
        domain: { type: 'string', enum: ['general', 'legal', 'medical', 'technical', 'financial'], default: 'general' },
      },
      required: ['inputPath', 'outputPath', 'targetLanguage'],
    },
  },
  {
    id: 'ent_translate_detect',
    name: 'Detect Language',
    description: 'Detect the language of a given text. Returns language code, name, confidence score, and alternative possibilities.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-translation',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
      },
      required: ['text'],
    },
  },
  {
    id: 'ent_translate_batch',
    name: 'Batch Translate',
    description: 'Translate multiple text strings in a single call. Efficient for translating UI labels, product descriptions, or form fields.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-translation',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        texts: { type: 'array', items: { type: 'string' }, description: 'Array of strings to translate' },
        targetLanguage: { type: 'string' },
        sourceLanguage: { type: 'string' },
      },
      required: ['texts', 'targetLanguage'],
    },
  },
  {
    id: 'ent_translate_localize',
    name: 'Localize Content',
    description: 'Adapt content for a target locale beyond translation: adjust date formats, currency symbols, number formatting, units of measurement, and cultural references.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-translation',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Content to localize' },
        targetLocale: { type: 'string', description: 'Target locale (e.g., "fr-FR", "de-DE", "ja-JP")' },
        adaptDates: { type: 'boolean', default: true },
        adaptCurrency: { type: 'boolean', default: true },
        adaptUnits: { type: 'boolean', default: true },
      },
      required: ['text', 'targetLocale'],
    },
  },
];
