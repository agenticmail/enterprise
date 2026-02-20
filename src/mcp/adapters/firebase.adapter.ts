/**
 * MCP Skill Adapter — Firebase (Firestore)
 *
 * Maps Google Cloud Firestore REST API endpoints to MCP tool handlers.
 * Provides access to listing, reading, creating, updating, and querying
 * Firestore documents.
 *
 * Firestore REST API docs: https://firebase.google.com/docs/firestore/reference/rest
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function firebaseError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const status = data.error?.status || data.error?.code || '';
      const message = data.error?.message || data.message || err.message;
      const detail = status ? `${message} (status: ${status})` : message;
      return { content: `Firebase API error: ${detail}`, isError: true };
    }
    return { content: `Firebase API error: ${err.message}`, isError: true };
  }
  return { content: `Firebase API error: ${String(err)}`, isError: true };
}

/** Build the Firestore base path for a project */
function firestorePath(ctx: ToolExecutionContext): string {
  const projectId = ctx.skillConfig.projectId;
  return `/projects/${projectId}/databases/(default)/documents`;
}

/** Format a Firestore document value into a readable string */
function formatValue(val: any): string {
  if (!val || typeof val !== 'object') return String(val);
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return val.integerValue;
  if (val.doubleValue !== undefined) return String(val.doubleValue);
  if (val.booleanValue !== undefined) return String(val.booleanValue);
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.nullValue !== undefined) return 'null';
  if (val.mapValue) return JSON.stringify(val.mapValue.fields || {});
  if (val.arrayValue) return JSON.stringify(val.arrayValue.values || []);
  return JSON.stringify(val);
}

/** Format a Firestore document into a readable summary */
function formatDocument(doc: any): string {
  const name = doc.name || 'unknown';
  const id = name.split('/').pop() || 'unknown';
  const fields = doc.fields || {};
  const fieldSummary = Object.entries(fields)
    .map(([key, val]) => `${key}: ${formatValue(val)}`)
    .join(', ');
  return `${id} — {${fieldSummary}}`;
}

// ─── Tool: firebase_list_documents ──────────────────────

const listDocuments: ToolHandler = {
  description:
    'List documents in a Firestore collection. Returns document IDs and field summaries.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Collection path (e.g. "users" or "users/abc/orders")',
      },
      pageSize: {
        type: 'number',
        description: 'Maximum number of documents to return (default 20)',
      },
      pageToken: {
        type: 'string',
        description: 'Pagination token from a previous response',
      },
      orderBy: {
        type: 'string',
        description: 'Field to order by (e.g. "createdAt desc")',
      },
    },
    required: ['collection'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const basePath = firestorePath(ctx);
      const query: Record<string, string> = {
        pageSize: String(params.pageSize ?? 20),
      };
      if (params.pageToken) query.pageToken = params.pageToken;
      if (params.orderBy) query.orderBy = params.orderBy;

      const result = await ctx.apiExecutor.get(
        `${basePath}/${params.collection}`,
        query,
      );

      const documents: any[] = result.documents || [];
      if (documents.length === 0) {
        return { content: `No documents found in collection "${params.collection}".` };
      }

      const lines = documents.map((doc: any) => formatDocument(doc));

      return {
        content: `Found ${documents.length} document(s) in "${params.collection}":\n${lines.join('\n')}`,
        metadata: {
          count: documents.length,
          collection: params.collection,
          nextPageToken: result.nextPageToken || null,
        },
      };
    } catch (err) {
      return firebaseError(err);
    }
  },
};

// ─── Tool: firebase_get_document ────────────────────────

const getDocument: ToolHandler = {
  description:
    'Get a single Firestore document by its full path (collection/documentId).',
  inputSchema: {
    type: 'object',
    properties: {
      documentPath: {
        type: 'string',
        description: 'Full document path (e.g. "users/abc123")',
      },
    },
    required: ['documentPath'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const basePath = firestorePath(ctx);
      const result = await ctx.apiExecutor.get(`${basePath}/${params.documentPath}`);

      const fields = result.fields || {};
      const fieldLines = Object.entries(fields).map(([key, val]) =>
        `  ${key}: ${formatValue(val)}`,
      );

      const name = result.name || params.documentPath;
      const id = name.split('/').pop() || 'unknown';

      return {
        content: [
          `Document: ${id}`,
          `Path: ${params.documentPath}`,
          `Created: ${result.createTime || 'N/A'}`,
          `Updated: ${result.updateTime || 'N/A'}`,
          `Fields:`,
          ...fieldLines,
        ].join('\n'),
        metadata: {
          documentPath: params.documentPath,
          fields: Object.keys(fields),
        },
      };
    } catch (err) {
      return firebaseError(err);
    }
  },
};

// ─── Tool: firebase_create_document ─────────────────────

const createDocument: ToolHandler = {
  description:
    'Create a new document in a Firestore collection. Provide fields as key-value pairs.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Collection path (e.g. "users")',
      },
      documentId: {
        type: 'string',
        description: 'Custom document ID (optional — auto-generated if omitted)',
      },
      fields: {
        type: 'object',
        description: 'Document fields as key-value pairs (e.g. {"name": "Alice", "age": 30})',
      },
    },
    required: ['collection', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const basePath = firestorePath(ctx);

      // Convert simple values to Firestore value format
      const firestoreFields: Record<string, any> = {};
      for (const [key, val] of Object.entries(params.fields)) {
        if (typeof val === 'string') {
          firestoreFields[key] = { stringValue: val };
        } else if (typeof val === 'number') {
          firestoreFields[key] = Number.isInteger(val)
            ? { integerValue: String(val) }
            : { doubleValue: val };
        } else if (typeof val === 'boolean') {
          firestoreFields[key] = { booleanValue: val };
        } else if (val === null) {
          firestoreFields[key] = { nullValue: null };
        } else {
          firestoreFields[key] = { stringValue: JSON.stringify(val) };
        }
      }

      const query: Record<string, string> = {};
      if (params.documentId) query.documentId = params.documentId;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `${basePath}/${params.collection}`,
        query,
        body: { fields: firestoreFields },
      });

      const docName = result.name || 'unknown';
      const docId = docName.split('/').pop() || 'unknown';

      return {
        content: `Document created: ${docId} in "${params.collection}"\nPath: ${docName}`,
        metadata: {
          documentId: docId,
          collection: params.collection,
          name: docName,
        },
      };
    } catch (err) {
      return firebaseError(err);
    }
  },
};

// ─── Tool: firebase_update_document ─────────────────────

const updateDocument: ToolHandler = {
  description:
    'Update fields on an existing Firestore document. Only specified fields are updated.',
  inputSchema: {
    type: 'object',
    properties: {
      documentPath: {
        type: 'string',
        description: 'Full document path (e.g. "users/abc123")',
      },
      fields: {
        type: 'object',
        description: 'Fields to update as key-value pairs (e.g. {"status": "active"})',
      },
    },
    required: ['documentPath', 'fields'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const basePath = firestorePath(ctx);

      // Convert simple values to Firestore value format
      const firestoreFields: Record<string, any> = {};
      const updateMaskPaths: string[] = [];

      for (const [key, val] of Object.entries(params.fields)) {
        updateMaskPaths.push(key);
        if (typeof val === 'string') {
          firestoreFields[key] = { stringValue: val };
        } else if (typeof val === 'number') {
          firestoreFields[key] = Number.isInteger(val)
            ? { integerValue: String(val) }
            : { doubleValue: val };
        } else if (typeof val === 'boolean') {
          firestoreFields[key] = { booleanValue: val };
        } else if (val === null) {
          firestoreFields[key] = { nullValue: null };
        } else {
          firestoreFields[key] = { stringValue: JSON.stringify(val) };
        }
      }

      const queryParts = updateMaskPaths.map(p => `updateMask.fieldPaths=${encodeURIComponent(p)}`);
      const query: Record<string, string> = {};
      for (const path of updateMaskPaths) {
        query[`updateMask.fieldPaths`] = path;
      }

      const result = await ctx.apiExecutor.patch(
        `${basePath}/${params.documentPath}`,
        { fields: firestoreFields },
      );

      const docId = (result.name || params.documentPath).split('/').pop() || 'unknown';

      return {
        content: `Document updated: ${docId}\nUpdated fields: ${updateMaskPaths.join(', ')}`,
        metadata: {
          documentPath: params.documentPath,
          updatedFields: updateMaskPaths,
        },
      };
    } catch (err) {
      return firebaseError(err);
    }
  },
};

// ─── Tool: firebase_query ───────────────────────────────

const queryDocuments: ToolHandler = {
  description:
    'Run a structured query against a Firestore collection. Supports field filters, ordering, and limits.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Collection ID to query (e.g. "users")',
      },
      field: {
        type: 'string',
        description: 'Field name to filter on',
      },
      op: {
        type: 'string',
        enum: ['EQUAL', 'NOT_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'ARRAY_CONTAINS', 'IN'],
        description: 'Filter operator',
      },
      value: {
        type: 'string',
        description: 'Value to compare against (as string)',
      },
      orderByField: {
        type: 'string',
        description: 'Field to order results by (optional)',
      },
      orderDirection: {
        type: 'string',
        enum: ['ASCENDING', 'DESCENDING'],
        description: 'Order direction (default: ASCENDING)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20)',
      },
    },
    required: ['collection'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const basePath = firestorePath(ctx);

      const structuredQuery: Record<string, any> = {
        from: [{ collectionId: params.collection }],
      };

      // Add filter if provided
      if (params.field && params.op && params.value !== undefined) {
        structuredQuery.where = {
          fieldFilter: {
            field: { fieldPath: params.field },
            op: params.op,
            value: { stringValue: params.value },
          },
        };
      }

      // Add ordering
      if (params.orderByField) {
        structuredQuery.orderBy = [{
          field: { fieldPath: params.orderByField },
          direction: params.orderDirection || 'ASCENDING',
        }];
      }

      // Add limit
      structuredQuery.limit = params.limit ?? 20;

      const result = await ctx.apiExecutor.post(
        `${basePath}:runQuery`,
        { structuredQuery },
      );

      const results: any[] = Array.isArray(result) ? result : [];
      const documents = results
        .filter((r: any) => r.document)
        .map((r: any) => r.document);

      if (documents.length === 0) {
        return { content: `No documents matched the query in "${params.collection}".` };
      }

      const lines = documents.map((doc: any) => formatDocument(doc));

      return {
        content: `Query returned ${documents.length} document(s) from "${params.collection}":\n${lines.join('\n')}`,
        metadata: { count: documents.length, collection: params.collection },
      };
    } catch (err) {
      return firebaseError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const firebaseAdapter: SkillAdapter = {
  skillId: 'firebase',
  name: 'Firebase',
  baseUrl: 'https://firestore.googleapis.com/v1',
  auth: {
    type: 'oauth2',
    provider: 'google',
  },
  tools: {
    firebase_list_documents: listDocuments,
    firebase_get_document: getDocument,
    firebase_create_document: createDocument,
    firebase_update_document: updateDocument,
    firebase_query: queryDocuments,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
  configSchema: {
    projectId: {
      type: 'string' as const,
      label: 'Firebase Project ID',
      description: 'Your Firebase project ID (found in Firebase Console settings)',
      required: true,
      placeholder: 'my-firebase-project',
    },
  },
};
