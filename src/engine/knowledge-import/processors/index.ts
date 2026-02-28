/**
 * Processing Pipeline — Barrel Export
 *
 * Files:
 *   types.ts             — Shared types for all layers
 *   extract-web.ts       — Layer 1: Web/URL extractor (Intercom, Zendesk, GitBook, etc.)
 *   extract-github.ts    — Layer 1: GitHub content extractor
 *   extract-sharepoint.ts— Layer 1: SharePoint/OneDrive extractor
 *   extract-gdrive.ts    — Layer 1: Google Drive/Sites extractor
 *   clean.ts             — Layer 2: 3-pass deep cleaning & normalization
 *   validate.ts          — Layer 3: Quality gates & scoring (6 checks)
 *   pipeline.ts          — Orchestrator: chains all 3 layers
 */

export { processDocument } from './pipeline.js';
export { cleanContent } from './clean.js';
export { validateContent } from './validate.js';
export type { ProcessedDocument, DocumentSection, QualityReport, QualityCheck, LayerReport } from './types.js';
