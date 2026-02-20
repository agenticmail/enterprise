import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-web-research',
  name: 'Web Research & Scraping',
  description: 'Research topics on the web, scrape structured data from public websites, monitor web pages for changes, and extract specific data points. Respects robots.txt and rate limits.',
  category: 'research',
  risk: 'medium',
  icon: '🌐',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_web_search',
    name: 'Web Search',
    description: 'Search the web for information on any topic. Returns ranked results with titles, URLs, snippets, and publication dates.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-web-research',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', default: 10 },
        dateRestrict: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Limit to recent results' },
        site: { type: 'string', description: 'Restrict search to a specific domain' },
        language: { type: 'string', default: 'en' },
      },
      required: ['query'],
    },
  },
  {
    id: 'ent_web_scrape',
    name: 'Scrape Web Page',
    description: 'Extract content from a web page. Returns clean text, structured data (tables, lists), metadata (title, description, author), and links. Renders JavaScript if needed.',
    category: 'read',
    risk: 'medium',
    skillId: 'enterprise-web-research',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        selector: { type: 'string', description: 'CSS selector to extract specific elements (e.g., "article", ".price", "table")' },
        format: { type: 'string', enum: ['markdown', 'text', 'html', 'json'], default: 'markdown' },
        waitForSelector: { type: 'string', description: 'CSS selector to wait for before extraction (for JS-rendered pages)' },
        extractLinks: { type: 'boolean', default: false },
        extractImages: { type: 'boolean', default: false },
      },
      required: ['url'],
    },
  },
  {
    id: 'ent_web_extract_data',
    name: 'Extract Structured Data',
    description: 'Extract structured data from a web page using AI. Define what data points you want (e.g., product name, price, rating) and get back a clean JSON object.',
    category: 'read',
    risk: 'medium',
    skillId: 'enterprise-web-research',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to extract from' },
        fields: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'date'] } } }, description: 'Data fields to extract' },
        multiple: { type: 'boolean', description: 'Extract multiple items (e.g., all products on a page)', default: false },
      },
      required: ['url', 'fields'],
    },
  },
  {
    id: 'ent_web_monitor',
    name: 'Monitor Web Page',
    description: 'Set up monitoring for a web page to detect changes. Checks periodically and reports when content at a specific selector changes.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-web-research',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to monitor' },
        selector: { type: 'string', description: 'CSS selector for the content to watch' },
        checkInterval: { type: 'string', enum: ['hourly', 'daily', 'weekly'], default: 'daily' },
        notifyOnChange: { type: 'boolean', default: true },
      },
      required: ['url'],
    },
  },
  {
    id: 'ent_web_screenshot',
    name: 'Take Screenshot',
    description: 'Capture a screenshot of a web page. Supports full-page capture, specific element capture, and custom viewport sizes.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-web-research',
    sideEffects: ['network-request', 'modifies-files'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to screenshot' },
        outputPath: { type: 'string', description: 'Output image path' },
        fullPage: { type: 'boolean', default: false },
        selector: { type: 'string', description: 'Capture specific element only' },
        viewport: { type: 'object', properties: { width: { type: 'number', default: 1280 }, height: { type: 'number', default: 720 } } },
      },
      required: ['url', 'outputPath'],
    },
  },
];
