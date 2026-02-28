/**
 * Knowledge Import System — Barrel Export
 *
 * Directory structure:
 *   types.ts              — Shared types and interfaces
 *   chunker.ts            — Document → knowledge entry chunking
 *   import-manager.ts     — Job orchestration and pipeline
 *   routes.ts             — API routes (Hono)
 *   provider-github.ts    — GitHub repos (public + private)
 *   provider-sharepoint.ts — Microsoft SharePoint Online
 *   provider-google-sites.ts — Google Drive + Google Sites
 *   provider-url.ts       — Any public URL / web crawler
 *   provider-file-upload.ts — Direct file upload
 */

export { KnowledgeImportManager } from './import-manager.js';
export { createKnowledgeImportRoutes } from './routes.js';
export type {
  ImportSourceType,
  ImportStatus,
  ImportSource,
  ImportJob,
  ImportProgress,
  ImportDocument,
  ImportChunk,
  ImportProvider,
} from './types.js';
