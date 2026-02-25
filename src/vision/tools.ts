/**
 * Vision Tools — agent-callable tools for visual memory + browser intelligence.
 * 
 * 11 tools combining agentralabs/agentic-vision concepts with browser speed improvements:
 * 
 * Visual Memory:
 *   vision_capture     - Capture and store a screenshot/image in visual memory
 *   vision_query       - Query visual memory by time, description, session
 *   vision_similar     - Find visually similar past captures
 *   vision_compare     - Compare two captures side-by-side  
 *   vision_diff        - Pixel-level diff between two captures
 *   vision_stats       - Get visual memory stats
 *   vision_link        - Link a capture to agent memory
 * 
 * Browser Intelligence (speed improvements):
 *   page_actions       - Discover all interactable elements on current page
 *   page_meta          - Quick metadata extraction (title, forms, links, etc.)
 *   smart_navigate     - Navigate + wait + extract in one call
 *   batch_actions      - Execute multiple browser actions in sequence
 */

import type { VisualMemoryStore } from './store.js';
import { computeDiff } from './diff.js';
import { PAGE_EXTRACTOR_SCRIPT, PAGE_META_SCRIPT } from './page-extractor.js';

export interface VisionToolsConfig {
  store: VisualMemoryStore;
  agentId: string;
  sessionId?: string;
  // Browser handle for page interaction tools
  getBrowser?: () => any;
}

export function createVisionTools(config: VisionToolsConfig) {
  const { store, agentId, sessionId } = config;

  return [
    // ─── Visual Memory Tools ────────────────────────────────

    {
      name: 'vision_capture',
      description: 'Capture a screenshot or image and store it in visual memory. The image is hashed for similarity search, thumbnailed for storage, and indexed for future recall.',
      input_schema: {
        type: 'object' as const,
        properties: {
          source: { type: 'string', description: 'Image source: "screenshot" (capture current browser page), "file" (local file path), or "base64" (raw image data)' },
          path: { type: 'string', description: 'File path (if source=file) or base64 data (if source=base64)' },
          description: { type: 'string', description: 'Human description of what this capture shows' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Tags/labels for categorization' },
          url: { type: 'string', description: 'Page URL (auto-detected for screenshots)' },
        },
        required: ['source'],
      },
      handler: async (params: any) => {
        try {
          let imageData: Buffer;
          let pageTitle: string | undefined;
          let pageUrl: string | undefined;

          if (params.source === 'screenshot') {
            const browser = config.getBrowser?.();
            if (!browser) return { error: 'No browser available for screenshot' };
            const page = await browser.pages?.()[0];
            if (!page) return { error: 'No browser page open' };
            imageData = await page.screenshot({ type: 'jpeg', quality: 80 });
            pageTitle = await page.title().catch(() => '');
            pageUrl = page.url();
          } else if (params.source === 'file') {
            const fs = await import('fs');
            imageData = fs.readFileSync(params.path);
          } else if (params.source === 'base64') {
            imageData = Buffer.from(params.path, 'base64');
          } else {
            return { error: 'Invalid source. Use "screenshot", "file", or "base64"' };
          }

          const obs = await store.capture(agentId, imageData, {
            source: { type: params.source as any, path: params.path, url: pageUrl },
            sessionId,
            description: params.description,
            labels: params.labels,
            pageTitle: pageTitle || params.pageTitle,
            pageUrl: pageUrl || params.url,
          });

          return {
            id: obs.id,
            timestamp: obs.timestamp,
            phash: obs.phash,
            quality: obs.metadata.qualityScore,
            dimensions: `${obs.metadata.originalWidth}x${obs.metadata.originalHeight}`,
            description: obs.description,
            stored: true,
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    },

    {
      name: 'vision_query',
      description: 'Query visual memory. Search past captures by time range, description text, session, or quality threshold.',
      input_schema: {
        type: 'object' as const,
        properties: {
          description: { type: 'string', description: 'Search text to match against descriptions' },
          session: { type: 'string', description: 'Filter by session ID' },
          hours: { type: 'number', description: 'Look back N hours (default: 24)' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
          minQuality: { type: 'number', description: 'Minimum quality score 0-1' },
        },
      },
      handler: async (params: any) => {
        const hours = params.hours || 24;
        const results = await store.query({
          agentId,
          sessionId: params.session,
          description: params.description,
          timeRange: { start: Date.now() - hours * 3600000, end: Date.now() },
          limit: params.limit || 10,
          minQuality: params.minQuality,
        });
        return {
          count: results.length,
          captures: results.map(r => ({
            id: r.id,
            timestamp: new Date(r.timestamp).toISOString(),
            description: r.description,
            url: r.metadata.pageUrl,
            title: r.metadata.pageTitle,
            quality: r.metadata.qualityScore,
            labels: r.labels,
            hasThumbnail: !!r.thumbnail,
          })),
        };
      },
    },

    {
      name: 'vision_similar',
      description: 'Find visually similar captures in memory. Provide a capture ID to find pages/screenshots that look alike.',
      input_schema: {
        type: 'object' as const,
        properties: {
          captureId: { type: 'number', description: 'ID of the capture to find similar matches for' },
          limit: { type: 'number', description: 'Max results (default: 5)' },
          minSimilarity: { type: 'number', description: 'Minimum similarity 0-1 (default: 0.75)' },
        },
        required: ['captureId'],
      },
      handler: async (params: any) => {
        const obs = await store.get(params.captureId);
        if (!obs) return { error: `Capture ${params.captureId} not found` };

        const matches = await store.findSimilar(agentId, obs.phash, params.limit || 5, params.minSimilarity || 0.75);
        return {
          query: { id: obs.id, description: obs.description, url: obs.metadata.pageUrl },
          matches: matches.filter(m => m.id !== obs.id).map(m => ({
            id: m.id,
            similarity: Math.round(m.similarity * 100) + '%',
            description: m.observation.description,
            url: m.observation.metadata.pageUrl,
            timestamp: new Date(m.observation.timestamp).toISOString(),
          })),
        };
      },
    },

    {
      name: 'vision_compare',
      description: 'Compare two visual captures. Returns their metadata side-by-side for LLM analysis.',
      input_schema: {
        type: 'object' as const,
        properties: {
          beforeId: { type: 'number', description: 'ID of the first (before) capture' },
          afterId: { type: 'number', description: 'ID of the second (after) capture' },
        },
        required: ['beforeId', 'afterId'],
      },
      handler: async (params: any) => {
        const [before, after] = await Promise.all([
          store.get(params.beforeId),
          store.get(params.afterId),
        ]);
        if (!before) return { error: `Capture ${params.beforeId} not found` };
        if (!after) return { error: `Capture ${params.afterId} not found` };

        const similarity = (await import('./phash.js')).hashSimilarity(before.phash, after.phash);

        return {
          similarity: Math.round(similarity * 100) + '%',
          before: {
            id: before.id, timestamp: new Date(before.timestamp).toISOString(),
            description: before.description, url: before.metadata.pageUrl,
            dimensions: `${before.metadata.originalWidth}x${before.metadata.originalHeight}`,
          },
          after: {
            id: after.id, timestamp: new Date(after.timestamp).toISOString(),
            description: after.description, url: after.metadata.pageUrl,
            dimensions: `${after.metadata.originalWidth}x${after.metadata.originalHeight}`,
          },
          timeDelta: `${Math.round((after.timestamp - before.timestamp) / 60000)} minutes`,
        };
      },
    },

    {
      name: 'vision_diff',
      description: 'Pixel-level diff between two captures. Shows exactly which regions changed and by how much.',
      input_schema: {
        type: 'object' as const,
        properties: {
          beforeId: { type: 'number', description: 'ID of the before capture' },
          afterId: { type: 'number', description: 'ID of the after capture' },
        },
        required: ['beforeId', 'afterId'],
      },
      handler: async (params: any) => {
        const [before, after] = await Promise.all([
          store.get(params.beforeId),
          store.get(params.afterId),
        ]);
        if (!before?.thumbnail || !after?.thumbnail) return { error: 'Capture not found or missing thumbnail' };

        const diff = await computeDiff(before.id, after.id, before.thumbnail, after.thumbnail);
        return {
          similarity: Math.round(diff.similarity * 100) + '%',
          pixelDiffRatio: Math.round(diff.pixelDiffRatio * 100) + '%',
          changedRegions: diff.changedRegions.length,
          regions: diff.changedRegions.map(r => `(${r.x},${r.y}) ${r.w}x${r.h}`),
          verdict: diff.similarity > 0.95 ? 'Nearly identical' :
                   diff.similarity > 0.80 ? 'Minor changes' :
                   diff.similarity > 0.50 ? 'Significant changes' : 'Major differences',
        };
      },
    },

    {
      name: 'vision_stats',
      description: 'Get visual memory statistics for the current agent.',
      input_schema: { type: 'object' as const, properties: {} },
      handler: async () => {
        const stats = await store.stats(agentId);
        return {
          totalCaptures: stats.total,
          sessions: stats.sessions,
          oldestCapture: stats.oldest ? new Date(stats.oldest).toISOString() : 'none',
          newestCapture: stats.newest ? new Date(stats.newest).toISOString() : 'none',
        };
      },
    },

    {
      name: 'vision_link',
      description: 'Link a visual capture to an agent memory node, bridging what the agent sees with what it knows.',
      input_schema: {
        type: 'object' as const,
        properties: {
          captureId: { type: 'number', description: 'Capture ID to link' },
          memoryId: { type: 'string', description: 'Memory node ID to link to' },
        },
        required: ['captureId', 'memoryId'],
      },
      handler: async (params: any) => {
        await store.linkToMemory(params.captureId, params.memoryId);
        return { linked: true, captureId: params.captureId, memoryId: params.memoryId };
      },
    },

    // ─── Browser Intelligence Tools (Speed Improvements) ────

    {
      name: 'page_actions',
      description: 'Discover all interactable elements on the current browser page. Returns buttons, links, inputs, selects with their selectors, labels, and risk levels. Much faster than taking a screenshot and analyzing it visually.',
      input_schema: {
        type: 'object' as const,
        properties: {
          targetId: { type: 'string', description: 'Browser tab targetId (optional, uses active tab)' },
        },
      },
      handler: async (params: any) => {
        const browser = config.getBrowser?.();
        if (!browser) return { error: 'No browser available' };
        try {
          const pages = await browser.pages();
          const page = params.targetId
            ? pages.find((p: any) => p.target?.()._targetId === params.targetId) || pages[0]
            : pages[0];
          if (!page) return { error: 'No page open' };
          const actions = await page.evaluate(PAGE_EXTRACTOR_SCRIPT);
          return { url: page.url(), actionCount: actions.length, actions };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    },

    {
      name: 'page_meta',
      description: 'Quick metadata extraction from current browser page — title, URL, form count, link count, whether it has login/search, scroll height. Instant, no screenshot needed.',
      input_schema: {
        type: 'object' as const,
        properties: {
          targetId: { type: 'string', description: 'Browser tab targetId (optional)' },
        },
      },
      handler: async (params: any) => {
        const browser = config.getBrowser?.();
        if (!browser) return { error: 'No browser available' };
        try {
          const pages = await browser.pages();
          const page = params.targetId
            ? pages.find((p: any) => p.target?.()._targetId === params.targetId) || pages[0]
            : pages[0];
          if (!page) return { error: 'No page open' };
          return await page.evaluate(PAGE_META_SCRIPT);
        } catch (err: any) {
          return { error: err.message };
        }
      },
    },

    {
      name: 'smart_navigate',
      description: 'Navigate to a URL, wait for it to load, and extract page metadata + available actions in ONE call. Saves 2-3 round trips compared to separate navigate → wait → snapshot.',
      input_schema: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          waitFor: { type: 'string', description: 'CSS selector to wait for (optional)' },
          timeout: { type: 'number', description: 'Max wait ms (default: 10000)' },
          captureScreenshot: { type: 'boolean', description: 'Also capture to visual memory (default: false)' },
        },
        required: ['url'],
      },
      handler: async (params: any) => {
        const browser = config.getBrowser?.();
        if (!browser) return { error: 'No browser available' };
        try {
          const pages = await browser.pages();
          const page = pages[0];
          if (!page) return { error: 'No page open' };

          await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: params.timeout || 10000 });
          if (params.waitFor) {
            await page.waitForSelector(params.waitFor, { timeout: params.timeout || 10000 }).catch(() => {});
          }
          // Small delay for dynamic content
          await new Promise(r => setTimeout(r, 500));

          const [meta, actions] = await Promise.all([
            page.evaluate(PAGE_META_SCRIPT),
            page.evaluate(PAGE_EXTRACTOR_SCRIPT),
          ]);

          let captureId: number | undefined;
          if (params.captureScreenshot) {
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 80 });
            const obs = await store.capture(agentId, screenshot, {
              source: { type: 'browser', url: params.url },
              sessionId,
              description: `Navigated to: ${meta.title || params.url}`,
              pageTitle: meta.title,
              pageUrl: params.url,
            });
            captureId = obs.id;
          }

          return {
            loaded: true,
            meta,
            actionCount: actions.length,
            topActions: actions.slice(0, 20),
            captureId,
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    },

    {
      name: 'batch_actions',
      description: 'Execute multiple browser actions in sequence without waiting for LLM between each. Dramatically faster for multi-step flows (fill form → click submit → wait → extract result).',
      input_schema: {
        type: 'object' as const,
        properties: {
          actions: {
            type: 'array',
            description: 'Array of actions to execute in order',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: 'click, type, select, wait, screenshot, extract_meta' },
                selector: { type: 'string', description: 'CSS selector for click/type/select' },
                value: { type: 'string', description: 'Value for type/select' },
                timeout: { type: 'number', description: 'Wait timeout in ms' },
              },
              required: ['action'],
            },
          },
        },
        required: ['actions'],
      },
      handler: async (params: any) => {
        const browser = config.getBrowser?.();
        if (!browser) return { error: 'No browser available' };
        try {
          const pages = await browser.pages();
          const page = pages[0];
          if (!page) return { error: 'No page open' };

          const results: any[] = [];
          for (const step of params.actions) {
            try {
              switch (step.action) {
                case 'click':
                  await page.click(step.selector, { timeout: step.timeout || 5000 });
                  results.push({ action: 'click', selector: step.selector, ok: true });
                  break;
                case 'type':
                  await page.fill(step.selector, step.value || '', { timeout: step.timeout || 5000 });
                  results.push({ action: 'type', selector: step.selector, ok: true });
                  break;
                case 'select':
                  await page.selectOption(step.selector, step.value || '', { timeout: step.timeout || 5000 });
                  results.push({ action: 'select', selector: step.selector, ok: true });
                  break;
                case 'wait':
                  if (step.selector) {
                    await page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
                  } else {
                    await new Promise(r => setTimeout(r, step.timeout || 1000));
                  }
                  results.push({ action: 'wait', ok: true });
                  break;
                case 'screenshot': {
                  const img = await page.screenshot({ type: 'jpeg', quality: 80 });
                  const obs = await store.capture(agentId, img, {
                    source: { type: 'browser', url: page.url() },
                    sessionId,
                    description: step.value || 'Batch action screenshot',
                    pageTitle: await page.title().catch(() => ''),
                    pageUrl: page.url(),
                  });
                  results.push({ action: 'screenshot', captureId: obs.id, ok: true });
                  break;
                }
                case 'extract_meta': {
                  const meta = await page.evaluate(PAGE_META_SCRIPT);
                  results.push({ action: 'extract_meta', meta, ok: true });
                  break;
                }
                default:
                  results.push({ action: step.action, error: 'Unknown action' });
              }
            } catch (err: any) {
              results.push({ action: step.action, selector: step.selector, error: err.message });
              // Continue to next step unless it's critical
            }
          }

          return { completed: results.length, results };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    },
  ];
}
