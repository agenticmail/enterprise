/**
 * Knowledge Import — File Upload Provider
 *
 * Imports documentation from directly uploaded files.
 * Supports: Markdown, HTML, TXT, PDF, DOCX, JSON, CSV.
 *
 * Files are received via multipart upload and processed in-memory.
 */

import type { ImportProvider, ImportDocument, ImportConfigField } from './types.js';

const SUPPORTED_EXTENSIONS: Record<string, 'markdown' | 'html' | 'text' | 'pdf'> = {
  'md': 'markdown',
  'mdx': 'markdown',
  'markdown': 'markdown',
  'html': 'html',
  'htm': 'html',
  'txt': 'text',
  'text': 'text',
  'rst': 'text',
  'adoc': 'text',
  'pdf': 'pdf',
  'json': 'text',
  'csv': 'text',
  'yaml': 'text',
  'yml': 'text',
};

const MAX_FILE_SIZE = 10_000_000; // 10MB

export class FileUploadImportProvider implements ImportProvider {
  type = 'file-upload' as const;

  getConfigFields(): ImportConfigField[] {
    return [
      { name: 'files', label: 'Files', type: 'text', required: true, helpText: 'Upload markdown, HTML, TXT, PDF, or DOCX files. Max 10MB per file.' },
    ];
  }

  async validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    const files = config.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return { valid: false, error: 'At least one file is required' };
    }

    for (const file of files) {
      if (!file.name) return { valid: false, error: 'Each file must have a name' };
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !SUPPORTED_EXTENSIONS[ext]) {
        return { valid: false, error: `Unsupported file type: .${ext}. Supported: ${Object.keys(SUPPORTED_EXTENSIONS).join(', ')}` };
      }
      if (file.size && file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File "${file.name}" exceeds 10MB limit` };
      }
    }

    return { valid: true };
  }

  async *discover(config: Record<string, any>): AsyncGenerator<ImportDocument> {
    const files: Array<{ name: string; content: string; size?: number }> = config.files || [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const contentType = SUPPORTED_EXTENSIONS[ext] || 'text';
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

      yield {
        id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        sourceType: 'file-upload',
        sourcePath: file.name,
        title,
        content: file.content,
        contentType,
        metadata: { filename: file.name, uploadedAt: new Date().toISOString() },
        size: file.size || file.content.length,
      };
    }
  }
}

/**
 * Parse uploaded multipart file data into the format expected by the provider.
 * Called from the route handler before passing to the import manager.
 */
export function parseUploadedFiles(formData: Array<{ filename: string; data: Buffer | string; mimeType?: string }>): Array<{ name: string; content: string; size: number }> {
  return formData.map(f => {
    const content = typeof f.data === 'string' ? f.data : f.data.toString('utf-8');
    return {
      name: f.filename,
      content,
      size: content.length,
    };
  });
}
