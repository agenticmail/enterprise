/**
 * MCP Skill Adapter — OpenAI
 *
 * Maps OpenAI REST API v1 endpoints to MCP tool handlers.
 * Covers chat completions, embeddings, model listing, image generation,
 * and content moderation.
 *
 * OpenAI API docs: https://platform.openai.com/docs/api-reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function openaiError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object' && data.error) {
      const detail = data.error.message || data.error.type || err.message;
      return { content: `OpenAI API error: ${detail}`, isError: true };
    }
    return { content: `OpenAI API error: ${err.message}`, isError: true };
  }
  return { content: `OpenAI API error: ${String(err)}`, isError: true };
}

// ─── Tool: openai_chat_completion ───────────────────────

const chatCompletion: ToolHandler = {
  description:
    'Create a chat completion using OpenAI models. Send a list of messages and receive an AI-generated response.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model ID to use (e.g. "gpt-4o", "gpt-4o-mini")',
      },
      messages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', description: 'Message role: "system", "user", or "assistant"' },
            content: { type: 'string', description: 'Message content' },
          },
          required: ['role', 'content'],
        },
        description: 'Array of chat messages',
      },
      temperature: {
        type: 'number',
        description: 'Sampling temperature between 0 and 2 (default 1)',
      },
      max_tokens: {
        type: 'number',
        description: 'Maximum number of tokens to generate',
      },
    },
    required: ['model', 'messages'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        model: params.model,
        messages: params.messages,
      };
      if (params.temperature !== undefined) body.temperature = params.temperature;
      if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens;

      const result = await ctx.apiExecutor.post('/chat/completions', body);

      const choice = result.choices?.[0];
      const content = choice?.message?.content || '';
      const usage = result.usage;

      return {
        content: `Response (model: ${result.model}, tokens: ${usage?.total_tokens ?? '?'}):\n${content}`,
        metadata: {
          model: result.model,
          finishReason: choice?.finish_reason,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (err) {
      return openaiError(err);
    }
  },
};

// ─── Tool: openai_create_embedding ──────────────────────

const createEmbedding: ToolHandler = {
  description:
    'Generate vector embeddings for input text using OpenAI embedding models. Useful for semantic search and similarity.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Embedding model ID (e.g. "text-embedding-3-small", "text-embedding-3-large")',
      },
      input: {
        type: 'string',
        description: 'Text to generate an embedding for',
      },
    },
    required: ['model', 'input'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.post('/embeddings', {
        model: params.model,
        input: params.input,
      });

      const embedding = result.data?.[0]?.embedding || [];
      const dimensions = embedding.length;
      const usage = result.usage;

      return {
        content: `Embedding generated (model: ${result.model}, dimensions: ${dimensions}, tokens: ${usage?.total_tokens ?? '?'}).\nFirst 5 values: [${embedding.slice(0, 5).join(', ')}...]`,
        metadata: {
          model: result.model,
          dimensions,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (err) {
      return openaiError(err);
    }
  },
};

// ─── Tool: openai_list_models ───────────────────────────

const listModels: ToolHandler = {
  description:
    'List all models available to the authenticated OpenAI account. Returns model IDs and ownership info.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/models');

      const models: any[] = Array.isArray(result.data) ? result.data : [];
      if (models.length === 0) {
        return { content: 'No models found.' };
      }

      const sorted = models.sort((a: any, b: any) => a.id.localeCompare(b.id));
      const lines = sorted.map((m: any) => `${m.id} (owned by: ${m.owned_by})`);

      return {
        content: `Found ${models.length} models:\n${lines.join('\n')}`,
        metadata: { count: models.length },
      };
    } catch (err) {
      return openaiError(err);
    }
  },
};

// ─── Tool: openai_create_image ──────────────────────────

const createImage: ToolHandler = {
  description:
    'Generate images using DALL-E. Provide a text prompt and optionally specify size and quality.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Text description of the desired image',
      },
      model: {
        type: 'string',
        description: 'Image model to use (e.g. "dall-e-3", "dall-e-2")',
      },
      size: {
        type: 'string',
        enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
        description: 'Image dimensions (default "1024x1024")',
      },
      quality: {
        type: 'string',
        enum: ['standard', 'hd'],
        description: 'Image quality — "standard" or "hd" (DALL-E 3 only)',
      },
      n: {
        type: 'number',
        description: 'Number of images to generate (default 1)',
      },
    },
    required: ['prompt'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        prompt: params.prompt,
        model: params.model || 'dall-e-3',
        size: params.size || '1024x1024',
        n: params.n ?? 1,
      };
      if (params.quality) body.quality = params.quality;

      const result = await ctx.apiExecutor.post('/images/generations', body);

      const images: any[] = result.data || [];
      if (images.length === 0) {
        return { content: 'No images were generated.', isError: true };
      }

      const lines = images.map((img: any, i: number) => {
        const url = img.url || img.b64_json ? '[base64 data]' : 'unknown';
        const revised = img.revised_prompt ? `\n  Revised prompt: ${img.revised_prompt}` : '';
        return `Image ${i + 1}: ${img.url || url}${revised}`;
      });

      return {
        content: `Generated ${images.length} image(s):\n${lines.join('\n')}`,
        metadata: { count: images.length, prompt: params.prompt },
      };
    } catch (err) {
      return openaiError(err);
    }
  },
};

// ─── Tool: openai_moderate ──────────────────────────────

const moderate: ToolHandler = {
  description:
    'Check text for policy violations using the OpenAI Moderation API. Returns category flags and scores.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Text to check for policy violations',
      },
      model: {
        type: 'string',
        description: 'Moderation model (e.g. "text-moderation-latest", optional)',
      },
    },
    required: ['input'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { input: params.input };
      if (params.model) body.model = params.model;

      const result = await ctx.apiExecutor.post('/moderations', body);

      const modResult = result.results?.[0];
      if (!modResult) {
        return { content: 'No moderation result returned.', isError: true };
      }

      const flagged = modResult.flagged;
      const flaggedCategories = Object.entries(modResult.categories || {})
        .filter(([, v]) => v === true)
        .map(([k]) => k);

      const summary = flagged
        ? `Content FLAGGED. Categories: ${flaggedCategories.join(', ')}`
        : 'Content is clean — no policy violations detected.';

      return {
        content: summary,
        metadata: {
          flagged,
          categories: modResult.categories,
          categoryScores: modResult.category_scores,
        },
      };
    } catch (err) {
      return openaiError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const openaiAdapter: SkillAdapter = {
  skillId: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Bearer',
  },
  tools: {
    openai_chat_completion: chatCompletion,
    openai_create_embedding: createEmbedding,
    openai_list_models: listModels,
    openai_create_image: createImage,
    openai_moderate: moderate,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 30,
  },
};
