/**
 * Google Slides API Tools
 *
 * Lets agents create, read, and update Google Slides presentations.
 * Uses Google Slides API v1: https://slides.googleapis.com
 *
 * Required OAuth scope: https://www.googleapis.com/auth/presentations
 *   or https://www.googleapis.com/auth/drive (for creation via Drive)
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import type { GoogleToolsConfig } from './index.js';
import { jsonResult, errorResult } from '../../common.js';

// ─── Helper ─────────────────────────────────────────────

async function slidesApi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const url = new URL(`https://slides.googleapis.com/v1${path}`);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Slides API ${res.status}: ${errText}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ─── Tool Definitions ───────────────────────────────────

export function createGoogleSlidesTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    // ─── Create Presentation ────────────────────────────
    {
      name: 'google_slides_create',
      description: 'Create a new Google Slides presentation with a title slide and optional subtitle. Also accepts an array of content slides to populate the presentation upfront (each with a title and body text). This is the recommended way to create presentations — avoids creating blank decks.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Presentation title (shown on title slide)' },
          subtitle: { type: 'string', description: 'Subtitle text for the title slide (e.g. author, date, team)' },
          slides: { type: 'string', description: 'JSON array of content slides: [{"title":"Slide Title","body":"Bullet points or text"},...]' },
        },
        required: ['title'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          // 1. Create the presentation
          const result = await slidesApi(token, '/presentations', {
            method: 'POST',
            body: { title: input.title },
          });
          const presentationId = result.presentationId;
          const firstSlide = result.slides?.[0];

          // 2. Populate the title slide (the default blank slide)
          if (firstSlide) {
            const requests: any[] = [];
            // Find or create a title text box and subtitle text box on the first slide
            const pageElements = firstSlide.pageElements || [];
            // Try to find existing placeholders
            let titlePlaceholder: string | null = null;
            let subtitlePlaceholder: string | null = null;
            for (const el of pageElements) {
              const ph = el.shape?.placeholder;
              if (ph?.type === 'CENTERED_TITLE' || ph?.type === 'TITLE') titlePlaceholder = el.objectId;
              if (ph?.type === 'SUBTITLE') subtitlePlaceholder = el.objectId;
            }

            // If no placeholders (truly blank), create text boxes
            const PT = 12700; // 1pt in EMU
            if (!titlePlaceholder) {
              const tid = 'title_' + Date.now();
              requests.push({
                createShape: {
                  objectId: tid, shapeType: 'TEXT_BOX',
                  elementProperties: {
                    pageObjectId: firstSlide.objectId,
                    size: { width: { magnitude: 600 * PT, unit: 'EMU' }, height: { magnitude: 60 * PT, unit: 'EMU' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 60 * PT, translateY: 150 * PT, unit: 'EMU' },
                  },
                },
              });
              requests.push({ insertText: { objectId: tid, text: input.title, insertionIndex: 0 } });
              requests.push({ updateTextStyle: { objectId: tid, style: { fontSize: { magnitude: 36, unit: 'PT' }, bold: true }, textRange: { type: 'ALL' }, fields: 'fontSize,bold' } });
            } else {
              requests.push({ insertText: { objectId: titlePlaceholder, text: input.title, insertionIndex: 0 } });
            }

            if (input.subtitle) {
              if (!subtitlePlaceholder) {
                const sid = 'subtitle_' + Date.now();
                requests.push({
                  createShape: {
                    objectId: sid, shapeType: 'TEXT_BOX',
                    elementProperties: {
                      pageObjectId: firstSlide.objectId,
                      size: { width: { magnitude: 500 * PT, unit: 'EMU' }, height: { magnitude: 40 * PT, unit: 'EMU' } },
                      transform: { scaleX: 1, scaleY: 1, translateX: 110 * PT, translateY: 240 * PT, unit: 'EMU' },
                    },
                  },
                });
                requests.push({ insertText: { objectId: sid, text: input.subtitle, insertionIndex: 0 } });
                requests.push({ updateTextStyle: { objectId: sid, style: { fontSize: { magnitude: 20, unit: 'PT' } }, textRange: { type: 'ALL' }, fields: 'fontSize' } });
              } else {
                requests.push({ insertText: { objectId: subtitlePlaceholder, text: input.subtitle, insertionIndex: 0 } });
              }
            }

            if (requests.length > 0) {
              await slidesApi(token, `/presentations/${presentationId}:batchUpdate`, {
                method: 'POST', body: { requests },
              });
            }
          }

          // 3. Add content slides if provided
          let contentSlides: any[] = [];
          if (input.slides) {
            try { contentSlides = JSON.parse(input.slides); } catch {}
          }

          for (const slide of contentSlides) {
            const PT = 12700;
            // Create slide with TITLE_AND_BODY layout
            const addReq: any = { createSlide: { slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' } } };
            const addResult = await slidesApi(token, `/presentations/${presentationId}:batchUpdate`, {
              method: 'POST', body: { requests: [addReq] },
            });
            const newSlideId = addResult.replies?.[0]?.createSlide?.objectId;
            if (!newSlideId) continue;

            // Get the new slide's placeholders
            const pageResult = await slidesApi(token, `/presentations/${presentationId}/pages/${newSlideId}`);
            const reqs: any[] = [];
            for (const el of (pageResult.pageElements || [])) {
              const ph = el.shape?.placeholder;
              if ((ph?.type === 'TITLE' || ph?.type === 'CENTERED_TITLE') && slide.title) {
                reqs.push({ insertText: { objectId: el.objectId, text: slide.title, insertionIndex: 0 } });
              }
              if (ph?.type === 'BODY' && slide.body) {
                reqs.push({ insertText: { objectId: el.objectId, text: slide.body, insertionIndex: 0 } });
              }
            }
            if (reqs.length > 0) {
              await slidesApi(token, `/presentations/${presentationId}:batchUpdate`, {
                method: 'POST', body: { requests: reqs },
              });
            }
          }

          // 4. Get final slide count
          const final = await slidesApi(token, `/presentations/${presentationId}`);
          return jsonResult({
            presentationId,
            title: result.title,
            url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
            slideCount: (final.slides || []).length,
            contentSlidesAdded: contentSlides.length,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Get Presentation ───────────────────────────────
    {
      name: 'google_slides_get',
      description: 'Get metadata and structure of a Google Slides presentation — title, slides, layouts, masters.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID (from URL or create response)' },
        },
        required: ['presentationId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await slidesApi(token, `/presentations/${input.presentationId}`);
          const slides = (result.slides || []).map((s: any, i: number) => {
            const textElements: string[] = [];
            for (const el of (s.pageElements || [])) {
              if (el.shape?.text?.textElements) {
                for (const te of el.shape.text.textElements) {
                  if (te.textRun?.content?.trim()) textElements.push(te.textRun.content.trim());
                }
              }
            }
            return {
              slideIndex: i,
              objectId: s.objectId,
              layoutId: s.slideProperties?.layoutObjectId,
              textContent: textElements.join(' | ') || '(no text)',
            };
          });
          return jsonResult({
            presentationId: result.presentationId,
            title: result.title,
            locale: result.locale,
            slideCount: slides.length,
            slides,
            url: `https://docs.google.com/presentation/d/${result.presentationId}/edit`,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Get Slide Page ─────────────────────────────────
    {
      name: 'google_slides_get_page',
      description: 'Get details of a specific slide page including all elements, text, images, and shapes.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          pageObjectId: { type: 'string', description: 'Slide page object ID' },
        },
        required: ['presentationId', 'pageObjectId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await slidesApi(token, `/presentations/${input.presentationId}/pages/${input.pageObjectId}`);
          const elements = (result.pageElements || []).map((el: any) => ({
            objectId: el.objectId,
            type: el.shape ? 'shape' : el.image ? 'image' : el.table ? 'table' : el.line ? 'line' : el.video ? 'video' : 'other',
            title: el.title,
            description: el.description,
            text: el.shape?.text?.textElements?.filter((t: any) => t.textRun?.content).map((t: any) => t.textRun.content).join('') || undefined,
            transform: el.transform ? { scaleX: el.transform.scaleX, scaleY: el.transform.scaleY, translateX: el.transform.translateX, translateY: el.transform.translateY } : undefined,
            size: el.size,
          }));
          return jsonResult({ pageObjectId: result.objectId, elements });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Get Slide Thumbnail ────────────────────────────
    {
      name: 'google_slides_thumbnail',
      description: 'Get a thumbnail image URL for a specific slide. Useful for previewing slides.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          pageObjectId: { type: 'string', description: 'Slide page object ID' },
          thumbnailSize: { type: 'string', description: 'Size: "SMALL", "MEDIUM", or "LARGE" (default: MEDIUM)' },
        },
        required: ['presentationId', 'pageObjectId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {};
          if (input.thumbnailSize) query['thumbnailProperties.thumbnailSize'] = input.thumbnailSize;
          const result = await slidesApi(token, `/presentations/${input.presentationId}/pages/${input.pageObjectId}/thumbnail`, { query });
          return jsonResult({ contentUrl: result.contentUrl, width: result.width, height: result.height });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Add Slide ──────────────────────────────────────
    {
      name: 'google_slides_add_slide',
      description: 'Add a new slide to a presentation. Can specify layout (BLANK, TITLE, TITLE_AND_BODY, TITLE_AND_TWO_COLUMNS, etc.).',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          insertionIndex: { type: 'string', description: 'Position to insert slide (0-based). Omit to append.' },
          layout: { type: 'string', description: 'Predefined layout: BLANK, TITLE, TITLE_AND_BODY, TITLE_AND_TWO_COLUMNS, TITLE_ONLY, SECTION_HEADER, SECTION_TITLE_AND_DESCRIPTION, ONE_COLUMN_TEXT, MAIN_POINT, BIG_NUMBER (default: BLANK)' },
        },
        required: ['presentationId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const req: any = { createSlide: {} };
          if (input.insertionIndex !== undefined) req.createSlide.insertionIndex = parseInt(input.insertionIndex);
          if (input.layout) req.createSlide.slideLayoutReference = { predefinedLayout: input.layout };
          const result = await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: { requests: [req] },
          });
          const slideId = result.replies?.[0]?.createSlide?.objectId;
          return jsonResult({ created: true, slideObjectId: slideId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Insert Text ────────────────────────────────────
    {
      name: 'google_slides_insert_text',
      description: 'Insert text into a shape or text box on a slide. Requires the objectId of the shape.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          objectId: { type: 'string', description: 'Object ID of the shape/text box to insert into' },
          text: { type: 'string', description: 'Text to insert' },
          insertionIndex: { type: 'string', description: 'Character index to insert at (default: 0 = beginning)' },
        },
        required: ['presentationId', 'objectId', 'text'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: {
              requests: [{
                insertText: {
                  objectId: input.objectId,
                  text: input.text,
                  insertionIndex: parseInt(input.insertionIndex || '0'),
                },
              }],
            },
          });
          return jsonResult({ inserted: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Replace All Text ───────────────────────────────
    {
      name: 'google_slides_replace_text',
      description: 'Replace all occurrences of text in a presentation. Great for template-based slide generation.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          findText: { type: 'string', description: 'Text to find (e.g. "{{title}}")' },
          replaceText: { type: 'string', description: 'Text to replace with' },
          matchCase: { type: 'string', description: '"true" for case-sensitive match (default: false)' },
        },
        required: ['presentationId', 'findText', 'replaceText'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: {
              requests: [{
                replaceAllText: {
                  containsText: { text: input.findText, matchCase: input.matchCase === 'true' },
                  replaceText: input.replaceText,
                },
              }],
            },
          });
          const count = result.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
          return jsonResult({ replaced: true, occurrencesChanged: count });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Create Text Box ────────────────────────────────
    {
      name: 'google_slides_create_textbox',
      description: 'Create a text box on a slide with specified position and size. Returns the objectId for inserting text.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          pageObjectId: { type: 'string', description: 'Slide page object ID to add the textbox to' },
          text: { type: 'string', description: 'Initial text for the textbox (optional)' },
          x: { type: 'string', description: 'X position in EMU (1 inch = 914400 EMU). Default: 100pt' },
          y: { type: 'string', description: 'Y position in EMU. Default: 100pt' },
          width: { type: 'string', description: 'Width in EMU. Default: 300pt' },
          height: { type: 'string', description: 'Height in EMU. Default: 50pt' },
        },
        required: ['presentationId', 'pageObjectId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const PT = 12700; // 1pt in EMU
          const objectId = 'textbox_' + Date.now();
          const requests: any[] = [{
            createShape: {
              objectId,
              shapeType: 'TEXT_BOX',
              elementProperties: {
                pageObjectId: input.pageObjectId,
                size: {
                  width: { magnitude: parseInt(input.width || String(300 * PT)), unit: 'EMU' },
                  height: { magnitude: parseInt(input.height || String(50 * PT)), unit: 'EMU' },
                },
                transform: {
                  scaleX: 1, scaleY: 1,
                  translateX: parseInt(input.x || String(100 * PT)),
                  translateY: parseInt(input.y || String(100 * PT)),
                  unit: 'EMU',
                },
              },
            },
          }];
          if (input.text) {
            requests.push({ insertText: { objectId, text: input.text, insertionIndex: 0 } });
          }
          await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: { requests },
          });
          return jsonResult({ created: true, objectId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Add Image to Slide ─────────────────────────────
    {
      name: 'google_slides_add_image',
      description: 'Add an image to a slide from a public URL.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          pageObjectId: { type: 'string', description: 'Slide page to add image to' },
          imageUrl: { type: 'string', description: 'Public URL of the image' },
          x: { type: 'string', description: 'X position in EMU (default: 100pt)' },
          y: { type: 'string', description: 'Y position in EMU (default: 100pt)' },
          width: { type: 'string', description: 'Width in EMU (default: 400pt)' },
          height: { type: 'string', description: 'Height in EMU (default: 300pt)' },
        },
        required: ['presentationId', 'pageObjectId', 'imageUrl'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const PT = 12700;
          const result = await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: {
              requests: [{
                createImage: {
                  url: input.imageUrl,
                  elementProperties: {
                    pageObjectId: input.pageObjectId,
                    size: {
                      width: { magnitude: parseInt(input.width || String(400 * PT)), unit: 'EMU' },
                      height: { magnitude: parseInt(input.height || String(300 * PT)), unit: 'EMU' },
                    },
                    transform: {
                      scaleX: 1, scaleY: 1,
                      translateX: parseInt(input.x || String(100 * PT)),
                      translateY: parseInt(input.y || String(100 * PT)),
                      unit: 'EMU',
                    },
                  },
                },
              }],
            },
          });
          const imageId = result.replies?.[0]?.createImage?.objectId;
          return jsonResult({ created: true, imageObjectId: imageId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Delete Slide ───────────────────────────────────
    {
      name: 'google_slides_delete_slide',
      description: 'Delete a slide from a presentation by its object ID.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          objectId: { type: 'string', description: 'Object ID of the slide to delete' },
        },
        required: ['presentationId', 'objectId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: { requests: [{ deleteObject: { objectId: input.objectId } }] },
          });
          return jsonResult({ deleted: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Duplicate Slide ────────────────────────────────
    {
      name: 'google_slides_duplicate_slide',
      description: 'Duplicate an existing slide in a presentation.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          objectId: { type: 'string', description: 'Object ID of the slide to duplicate' },
        },
        required: ['presentationId', 'objectId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: { requests: [{ duplicateObject: { objectId: input.objectId } }] },
          });
          const newId = result.replies?.[0]?.duplicateObject?.objectId;
          return jsonResult({ duplicated: true, newObjectId: newId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Batch Update (Raw) ─────────────────────────────
    {
      name: 'google_slides_batch_update',
      description: 'Send raw batchUpdate requests to the Slides API for advanced operations (create shapes, tables, format text, etc.). Accepts an array of request objects per the Slides API spec.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          presentationId: { type: 'string', description: 'Presentation ID' },
          requests: { type: 'string', description: 'JSON string of requests array (per Slides API batchUpdate spec)' },
        },
        required: ['presentationId', 'requests'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          let requests: any[];
          try { requests = JSON.parse(input.requests); } catch { return errorResult('Invalid JSON in requests parameter'); }
          const result = await slidesApi(token, `/presentations/${input.presentationId}:batchUpdate`, {
            method: 'POST',
            body: { requests },
          });
          return jsonResult({ replies: result.replies || [], writeControl: result.writeControl });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
