import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-vision',
  name: 'Image & Screenshot Analysis',
  description: 'Analyze images, screenshots, and visual content. Describe what is in an image, read text from screenshots, identify UI elements, detect objects, and extract visual data for reports and documentation.',
  category: 'data',
  risk: 'low',
  icon: '👁️',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_vision_describe',
    name: 'Describe Image',
    description: 'Generate a detailed description of an image including objects, people, text, colors, layout, and context. Useful for accessibility, documentation, and content analysis.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-vision',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to image file or URL' },
        detail: { type: 'string', enum: ['brief', 'detailed', 'exhaustive'], default: 'detailed' },
        focus: { type: 'string', description: 'What to focus on (e.g., "text content", "UI elements", "people", "data")' },
      },
      required: ['imagePath'],
    },
  },
  {
    id: 'ent_vision_read_text',
    name: 'Read Text from Image',
    description: 'Extract all visible text from an image or screenshot. More specialized than OCR — understands layout, columns, headers, and reading order.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-vision',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to image file' },
        region: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }, description: 'Specific region to read (optional)' },
        language: { type: 'string', default: 'en' },
      },
      required: ['imagePath'],
    },
  },
  {
    id: 'ent_vision_analyze_ui',
    name: 'Analyze UI Screenshot',
    description: 'Analyze a UI screenshot to identify interactive elements (buttons, inputs, links, menus), layout structure, and potential usability issues. Useful for QA and support.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-vision',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to UI screenshot' },
        platform: { type: 'string', enum: ['web', 'mobile-ios', 'mobile-android', 'desktop', 'auto'], default: 'auto' },
        findElement: { type: 'string', description: 'Specific element to locate (e.g., "login button", "search field")' },
      },
      required: ['imagePath'],
    },
  },
  {
    id: 'ent_vision_extract_chart',
    name: 'Extract Chart Data',
    description: 'Extract data from charts and graphs in images: bar charts, line charts, pie charts. Returns the underlying data values and labels.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-vision',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to image containing chart' },
        chartType: { type: 'string', enum: ['auto', 'bar', 'line', 'pie', 'scatter', 'table'], default: 'auto' },
        format: { type: 'string', enum: ['json', 'csv', 'markdown'], default: 'json' },
      },
      required: ['imagePath'],
    },
  },
  {
    id: 'ent_vision_compare',
    name: 'Compare Images',
    description: 'Compare two images and highlight visual differences. Useful for QA screenshot comparison, design review, and document change detection.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-vision',
    sideEffects: ['modifies-files'],
    parameters: {
      type: 'object',
      properties: {
        image1: { type: 'string', description: 'Path to first image' },
        image2: { type: 'string', description: 'Path to second image' },
        outputPath: { type: 'string', description: 'Path to save diff image highlighting changes' },
        threshold: { type: 'number', description: 'Pixel difference threshold (0-255)', default: 10 },
      },
      required: ['image1', 'image2'],
    },
  },
];
