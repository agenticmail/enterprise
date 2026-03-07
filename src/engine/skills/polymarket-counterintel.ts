import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'polymarket-counterintel',
  name: 'Polymarket Counter-Intelligence',
  description: 'Detect market manipulation and assess risks: wash trading and spoofing detection, resolution ambiguity risk scoring, and counterparty analysis (retail vs whale distribution).',
  category: 'finance',
  risk: 'medium',
  icon: Emoji.shield,
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'poly_manipulation_detector', name: 'Manipulation Detector',
    description: 'Detect wash trading, spoofing, layering, volume concentration, and price painting. Run before entering any large position.',
    category: 'read', risk: 'low', skillId: 'polymarket-counterintel', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string', description: 'Token ID to analyze' },
    }, required: ['token_id'] },
  },
  {
    id: 'poly_resolution_risk', name: 'Resolution Risk',
    description: 'Assess probability that a market resolves ambiguously, gets voided, or has unclear criteria. Some markets are traps with vague wording.',
    category: 'read', risk: 'low', skillId: 'polymarket-counterintel', sideEffects: [],
    parameters: { type: 'object', properties: {
      market_slug: { type: 'string' }, condition_id: { type: 'string' },
    } },
  },
  {
    id: 'poly_counterparty_analysis', name: 'Counterparty Analysis',
    description: 'Who is on the other side? Trading against retail (good) or whales/smart money (risky). Shows counterparty sophistication distribution.',
    category: 'read', risk: 'low', skillId: 'polymarket-counterintel', sideEffects: [],
    parameters: { type: 'object', properties: {
      token_id: { type: 'string' },
      side: { type: 'string', enum: ['BUY', 'SELL'], description: 'Your intended side' },
    }, required: ['token_id'] },
  },
];
