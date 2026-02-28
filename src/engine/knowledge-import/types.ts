/**
 * Knowledge Import System — Shared Types
 *
 * Common interfaces for all import sources (GitHub, SharePoint, Google Sites, etc.)
 */

export type ImportSourceType = 'github' | 'sharepoint' | 'google-sites' | 'confluence' | 'notion' | 'url' | 'file-upload';

export type ImportStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ImportSource {
  type: ImportSourceType;
  label: string;
  description: string;
  icon: string;
  requiresAuth: boolean;
  configFields: ImportConfigField[];
}

export interface ImportConfigField {
  name: string;
  label: string;
  type: 'text' | 'url' | 'password' | 'select' | 'checkbox' | 'textarea';
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  helpText?: string;
}

export interface ImportJob {
  id: string;
  orgId: string;
  baseId: string;           // target knowledge base
  sourceType: ImportSourceType;
  sourceConfig: Record<string, any>;
  status: ImportStatus;
  progress: ImportProgress;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ImportProgress {
  totalItems: number;
  processedItems: number;
  importedItems: number;
  skippedItems: number;
  failedItems: number;
  currentItem?: string;     // name of file/page currently being processed
  phase: 'discovering' | 'fetching' | 'processing' | 'importing' | 'done';
}

export interface ImportDocument {
  id: string;
  sourceType: ImportSourceType;
  sourcePath: string;       // e.g. "docs/getting-started.md" or SharePoint URL
  sourceUrl?: string;
  title: string;
  content: string;          // raw content (markdown, HTML, etc.)
  contentType: 'markdown' | 'html' | 'text' | 'pdf';
  metadata: Record<string, any>;
  lastModified?: string;
  size: number;
}

export interface ImportChunk {
  documentId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  categoryId: string;
  confidence: number;
  sourceUrl?: string;
  sourcePath: string;
}

/** Interface that every import provider must implement. */
export interface ImportProvider {
  type: ImportSourceType;

  /** Validate the source config before starting import. */
  validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }>;

  /** Discover all importable documents from the source. */
  discover(config: Record<string, any>): AsyncGenerator<ImportDocument>;

  /** Get the list of config fields this provider needs. */
  getConfigFields(): ImportConfigField[];
}
