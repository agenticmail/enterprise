/**
 * MCP Skill Adapter — HuggingFace
 *
 * Maps HuggingFace API endpoints to MCP tool handlers.
 * Covers inference, model listing/details, dataset listing, and spaces listing.
 *
 * HuggingFace API docs: https://huggingface.co/docs/api-inference
 * HuggingFace Hub API docs: https://huggingface.co/docs/hub/api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function hfError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.error || data.message || err.message;
      return { content: `HuggingFace API error: ${detail}`, isError: true };
    }
    return { content: `HuggingFace API error: ${err.message}`, isError: true };
  }
  return { content: `HuggingFace API error: ${String(err)}`, isError: true };
}

// ─── Tool: hf_inference ─────────────────────────────────

const inference: ToolHandler = {
  description:
    'Run inference on a HuggingFace model. Supports text generation, summarization, classification, and more depending on the model.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model ID on HuggingFace (e.g. "meta-llama/Llama-2-7b-chat-hf", "facebook/bart-large-cnn")',
      },
      inputs: {
        type: 'string',
        description: 'Input text for the model',
      },
      parameters: {
        type: 'object',
        description: 'Model-specific parameters (e.g. { "max_new_tokens": 100, "temperature": 0.7 })',
      },
    },
    required: ['model', 'inputs'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        inputs: params.inputs,
      };
      if (params.parameters) body.parameters = params.parameters;

      // Inference API uses a separate base URL
      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `https://api-inference.huggingface.co/models/${params.model}`,
        body,
      });

      // Response shape varies by task type
      let output: string;
      if (Array.isArray(result)) {
        if (result[0]?.generated_text) {
          output = result[0].generated_text;
        } else if (result[0]?.summary_text) {
          output = result[0].summary_text;
        } else if (result[0]?.label) {
          output = result.map((r: any) => `${r.label}: ${(r.score * 100).toFixed(1)}%`).join('\n');
        } else {
          output = JSON.stringify(result, null, 2);
        }
      } else if (typeof result === 'object' && result.generated_text) {
        output = result.generated_text;
      } else {
        output = JSON.stringify(result, null, 2);
      }

      return {
        content: `Inference result (model: ${params.model}):\n${output}`,
        metadata: { model: params.model },
      };
    } catch (err) {
      return hfError(err);
    }
  },
};

// ─── Tool: hf_list_models ───────────────────────────────

const listModels: ToolHandler = {
  description:
    'Search and list models on HuggingFace Hub. Filter by search query, author, or task.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search query to filter models by name or description',
      },
      author: {
        type: 'string',
        description: 'Filter by model author/organization (e.g. "meta-llama", "openai")',
      },
      filter: {
        type: 'string',
        description: 'Filter by task (e.g. "text-generation", "text-classification", "summarization")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of models to return (default 20)',
      },
      sort: {
        type: 'string',
        enum: ['downloads', 'likes', 'lastModified'],
        description: 'Sort order (default "downloads")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        sort: params.sort || 'downloads',
        direction: '-1',
      };
      if (params.search) query.search = params.search;
      if (params.author) query.author = params.author;
      if (params.filter) query.filter = params.filter;

      const result = await ctx.apiExecutor.get('/models', query);

      const models: any[] = Array.isArray(result) ? result : [];
      if (models.length === 0) {
        return { content: 'No models found.' };
      }

      const lines = models.map((m: any) => {
        const downloads = m.downloads != null ? `${m.downloads} downloads` : '';
        const likes = m.likes != null ? `${m.likes} likes` : '';
        const stats = [downloads, likes].filter(Boolean).join(', ');
        return `${m.modelId || m.id} — ${m.pipeline_tag || 'unknown task'}${stats ? ` (${stats})` : ''}`;
      });

      return {
        content: `Found ${models.length} models:\n${lines.join('\n')}`,
        metadata: { count: models.length },
      };
    } catch (err) {
      return hfError(err);
    }
  },
};

// ─── Tool: hf_get_model ─────────────────────────────────

const getModel: ToolHandler = {
  description:
    'Get detailed information about a specific HuggingFace model including description, tags, downloads, and config.',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'Full model ID (e.g. "meta-llama/Llama-2-7b-chat-hf")',
      },
    },
    required: ['modelId'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/models/${params.modelId}`);

      const lines = [
        `Model: ${result.modelId || result.id}`,
        `Author: ${result.author || 'unknown'}`,
        `Task: ${result.pipeline_tag || 'unknown'}`,
        `Downloads: ${result.downloads ?? 'unknown'}`,
        `Likes: ${result.likes ?? 'unknown'}`,
        `Library: ${result.library_name || 'unknown'}`,
        `License: ${result.cardData?.license || result.tags?.find((t: string) => t.startsWith('license:'))?.replace('license:', '') || 'unknown'}`,
        `Tags: ${(result.tags || []).slice(0, 10).join(', ')}`,
      ];

      if (result.lastModified) {
        lines.push(`Last modified: ${result.lastModified}`);
      }

      return {
        content: lines.join('\n'),
        metadata: { modelId: result.modelId || result.id, downloads: result.downloads },
      };
    } catch (err) {
      return hfError(err);
    }
  },
};

// ─── Tool: hf_list_datasets ─────────────────────────────

const listDatasets: ToolHandler = {
  description:
    'Search and list datasets on HuggingFace Hub. Filter by search query, author, or task.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search query to filter datasets',
      },
      author: {
        type: 'string',
        description: 'Filter by dataset author/organization',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of datasets to return (default 20)',
      },
      sort: {
        type: 'string',
        enum: ['downloads', 'likes', 'lastModified'],
        description: 'Sort order (default "downloads")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        sort: params.sort || 'downloads',
        direction: '-1',
      };
      if (params.search) query.search = params.search;
      if (params.author) query.author = params.author;

      const result = await ctx.apiExecutor.get('/datasets', query);

      const datasets: any[] = Array.isArray(result) ? result : [];
      if (datasets.length === 0) {
        return { content: 'No datasets found.' };
      }

      const lines = datasets.map((d: any) => {
        const downloads = d.downloads != null ? `${d.downloads} downloads` : '';
        const likes = d.likes != null ? `${d.likes} likes` : '';
        const stats = [downloads, likes].filter(Boolean).join(', ');
        return `${d.id} — ${d.description?.slice(0, 80) || 'no description'}${stats ? ` (${stats})` : ''}`;
      });

      return {
        content: `Found ${datasets.length} datasets:\n${lines.join('\n')}`,
        metadata: { count: datasets.length },
      };
    } catch (err) {
      return hfError(err);
    }
  },
};

// ─── Tool: hf_list_spaces ───────────────────────────────

const listSpaces: ToolHandler = {
  description:
    'Search and list Spaces on HuggingFace Hub. Spaces are hosted ML demo apps (Gradio, Streamlit, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search query to filter spaces',
      },
      author: {
        type: 'string',
        description: 'Filter by space author/organization',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of spaces to return (default 20)',
      },
      sort: {
        type: 'string',
        enum: ['likes', 'lastModified'],
        description: 'Sort order (default "likes")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        sort: params.sort || 'likes',
        direction: '-1',
      };
      if (params.search) query.search = params.search;
      if (params.author) query.author = params.author;

      const result = await ctx.apiExecutor.get('/spaces', query);

      const spaces: any[] = Array.isArray(result) ? result : [];
      if (spaces.length === 0) {
        return { content: 'No spaces found.' };
      }

      const lines = spaces.map((s: any) => {
        const sdk = s.sdk || 'unknown';
        const likes = s.likes != null ? `${s.likes} likes` : '';
        return `${s.id} — ${sdk}${likes ? ` (${likes})` : ''}`;
      });

      return {
        content: `Found ${spaces.length} spaces:\n${lines.join('\n')}`,
        metadata: { count: spaces.length },
      };
    } catch (err) {
      return hfError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const huggingfaceAdapter: SkillAdapter = {
  skillId: 'huggingface',
  name: 'HuggingFace',
  baseUrl: 'https://huggingface.co/api',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    hf_inference: inference,
    hf_list_models: listModels,
    hf_get_model: getModel,
    hf_list_datasets: listDatasets,
    hf_list_spaces: listSpaces,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
