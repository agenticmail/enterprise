/**
 * Google Forms API Tools
 *
 * Lets agents create forms, add questions, read responses, and manage form settings.
 * Uses Google Forms API v1: https://forms.googleapis.com
 *
 * Required OAuth scopes:
 *   https://www.googleapis.com/auth/forms.body (create/edit forms)
 *   https://www.googleapis.com/auth/forms.responses.readonly (read responses)
 *   https://www.googleapis.com/auth/drive (for form creation via Drive)
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import type { GoogleToolsConfig } from './index.js';
import { jsonResult, errorResult } from '../../common.js';

// ─── Helper ─────────────────────────────────────────────

async function formsApi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const url = new URL(`https://forms.googleapis.com/v1${path}`);
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
    throw new Error(`Google Forms API ${res.status}: ${errText}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ─── Tool Definitions ───────────────────────────────────

export function createGoogleFormsTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    // ─── Create Form ────────────────────────────────────
    {
      name: 'google_forms_create',
      description: 'Create a Google Form.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Form title' },
          documentTitle: { type: 'string', description: 'Document title (shown in Drive). Defaults to form title.' },
        },
        required: ['title'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {
            info: { title: input.title, documentTitle: input.documentTitle || input.title },
          };
          const result = await formsApi(token, '/forms', { method: 'POST', body });
          return jsonResult({
            formId: result.formId,
            title: result.info?.title,
            responderUri: result.responderUri,
            editUrl: `https://docs.google.com/forms/d/${result.formId}/edit`,
            responseUrl: `https://docs.google.com/forms/d/${result.formId}/viewanalytics`,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Get Form ───────────────────────────────────────
    {
      name: 'google_forms_get',
      description: 'Get a Google Form — title, description, all questions/items, and settings.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
        },
        required: ['formId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const result = await formsApi(token, `/forms/${input.formId}`);
          const items = (result.items || []).map((item: any) => {
            const q = item.questionItem?.question;
            const qg = item.questionGroupItem;
            return {
              itemId: item.itemId,
              title: item.title,
              description: item.description,
              questionType: q?.choiceQuestion ? 'choice' : q?.textQuestion ? 'text' : q?.scaleQuestion ? 'scale' : q?.dateQuestion ? 'date' : q?.timeQuestion ? 'time' : q?.fileUploadQuestion ? 'fileUpload' : qg ? 'questionGroup' : item.pageBreakItem ? 'pageBreak' : item.textItem ? 'textBlock' : item.imageItem ? 'image' : item.videoItem ? 'video' : 'unknown',
              required: q?.required || false,
              choiceOptions: q?.choiceQuestion?.options?.map((o: any) => o.value) || undefined,
              choiceType: q?.choiceQuestion?.type || undefined,
            };
          });
          return jsonResult({
            formId: result.formId,
            title: result.info?.title,
            description: result.info?.description,
            responderUri: result.responderUri,
            itemCount: items.length,
            items,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Add Questions (batchUpdate) ────────────────────
    {
      name: 'google_forms_add_question',
      description: 'Add a question to an existing Google Form. Supports text, multiple choice, checkbox, dropdown, scale, date, and time questions.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
          title: { type: 'string', description: 'Question title/text' },
          description: { type: 'string', description: 'Question description/help text' },
          type: { type: 'string', description: 'Question type: "text", "paragraph", "multipleChoice", "checkbox", "dropdown", "scale", "date", "time" (default: "text")' },
          required: { type: 'string', description: '"true" to make required' },
          options: { type: 'string', description: 'Comma-separated options for choice questions (e.g. "Yes,No,Maybe")' },
          scaleMin: { type: 'string', description: 'Scale min value (default: 1)' },
          scaleMax: { type: 'string', description: 'Scale max value (default: 5)' },
          scaleMinLabel: { type: 'string', description: 'Label for scale minimum' },
          scaleMaxLabel: { type: 'string', description: 'Label for scale maximum' },
          index: { type: 'string', description: 'Position index (0-based). Omit to append.' },
        },
        required: ['formId', 'title'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const qType = (input.type || 'text').toLowerCase();

          let question: any = { required: input.required === 'true' };

          if (qType === 'text') {
            question.textQuestion = { paragraph: false };
          } else if (qType === 'paragraph') {
            question.textQuestion = { paragraph: true };
          } else if (qType === 'multiplechoice' || qType === 'checkbox' || qType === 'dropdown') {
            const typeMap: Record<string, string> = { multiplechoice: 'RADIO', checkbox: 'CHECKBOX', dropdown: 'DROP_DOWN' };
            const opts = (input.options || '').split(',').map((o: string) => o.trim()).filter(Boolean);
            question.choiceQuestion = {
              type: typeMap[qType] || 'RADIO',
              options: opts.map((v: string) => ({ value: v })),
            };
          } else if (qType === 'scale') {
            question.scaleQuestion = {
              low: parseInt(input.scaleMin || '1'),
              high: parseInt(input.scaleMax || '5'),
              lowLabel: input.scaleMinLabel || undefined,
              highLabel: input.scaleMaxLabel || undefined,
            };
          } else if (qType === 'date') {
            question.dateQuestion = { includeTime: false, includeYear: true };
          } else if (qType === 'time') {
            question.timeQuestion = { duration: false };
          }

          const item: any = {
            title: input.title,
            questionItem: { question },
          };
          if (input.description) item.description = input.description;

          const request: any = {
            createItem: {
              item,
              location: { index: input.index !== undefined ? parseInt(input.index) : undefined },
            },
          };
          // If no index, remove location so it appends
          if (input.index === undefined) delete request.createItem.location;

          const result = await formsApi(token, `/forms/${input.formId}:batchUpdate`, {
            method: 'POST',
            body: { requests: [request] },
          });
          return jsonResult({ added: true, itemId: result.replies?.[0]?.createItem?.itemId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Update Form Info ───────────────────────────────
    {
      name: 'google_forms_update_info',
      description: 'Update form title and/or description.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
          title: { type: 'string', description: 'New form title' },
          description: { type: 'string', description: 'New form description' },
        },
        required: ['formId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const updateMasks: string[] = [];
          const info: any = {};
          if (input.title) { info.title = input.title; updateMasks.push('info.title'); }
          if (input.description !== undefined) { info.description = input.description; updateMasks.push('info.description'); }
          if (updateMasks.length === 0) return errorResult('Provide title or description to update');
          const result = await formsApi(token, `/forms/${input.formId}:batchUpdate`, {
            method: 'POST',
            body: {
              requests: [{
                updateFormInfo: {
                  info,
                  updateMask: updateMasks.join(','),
                },
              }],
            },
          });
          return jsonResult({ updated: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Delete Question ────────────────────────────────
    {
      name: 'google_forms_delete_item',
      description: 'Delete a question/item from a form by its index position.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
          index: { type: 'string', description: 'Item index (0-based) to delete' },
        },
        required: ['formId', 'index'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          await formsApi(token, `/forms/${input.formId}:batchUpdate`, {
            method: 'POST',
            body: { requests: [{ deleteItem: { location: { index: parseInt(input.index) } } }] },
          });
          return jsonResult({ deleted: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── List Responses ─────────────────────────────────
    {
      name: 'google_forms_list_responses',
      description: 'List form responses.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
          pageSize: { type: 'string', description: 'Max responses (default: 50)' },
          filter: { type: 'string', description: 'Filter by timestamp, e.g. "timestamp >= 2024-01-01T00:00:00Z"' },
        },
        required: ['formId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {};
          if (input.pageSize) query.pageSize = input.pageSize;
          if (input.filter) query.filter = input.filter;
          const result = await formsApi(token, `/forms/${input.formId}/responses`, { query });
          const responses = (result.responses || []).map((r: any) => {
            const answers: Record<string, any> = {};
            for (const [qId, ans] of Object.entries(r.answers || {})) {
              const a = ans as any;
              answers[qId] = {
                questionId: qId,
                textAnswers: a.textAnswers?.answers?.map((ta: any) => ta.value) || [],
                fileUploadAnswers: a.fileUploadAnswers?.answers?.map((f: any) => ({ fileId: f.fileId, fileName: f.fileName })) || undefined,
              };
            }
            return {
              responseId: r.responseId,
              createTime: r.createTime,
              lastSubmittedTime: r.lastSubmittedTime,
              respondentEmail: r.respondentEmail,
              totalScore: r.totalScore,
              answers,
            };
          });
          return jsonResult({ responses, count: responses.length, nextPageToken: result.nextPageToken });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Get Single Response ────────────────────────────
    {
      name: 'google_forms_get_response',
      description: 'Get a single form response by its response ID.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
          responseId: { type: 'string', description: 'Response ID' },
        },
        required: ['formId', 'responseId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const r = await formsApi(token, `/forms/${input.formId}/responses/${input.responseId}`);
          const answers: Record<string, any> = {};
          for (const [qId, ans] of Object.entries(r.answers || {})) {
            const a = ans as any;
            answers[qId] = {
              questionId: qId,
              textAnswers: a.textAnswers?.answers?.map((ta: any) => ta.value) || [],
            };
          }
          return jsonResult({
            responseId: r.responseId,
            createTime: r.createTime,
            lastSubmittedTime: r.lastSubmittedTime,
            respondentEmail: r.respondentEmail,
            totalScore: r.totalScore,
            answers,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Set Publish Settings ───────────────────────────
    {
      name: 'google_forms_publish_settings',
      description: 'Update publish settings of a form — control if it accepts responses, is published, etc.',
      category: 'productivity' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'Form ID' },
          isPublished: { type: 'string', description: '"true" to publish, "false" to unpublish' },
          isAcceptingResponses: { type: 'string', description: '"true" to accept responses, "false" to close' },
        },
        required: ['formId'],
      },
      async execute(_id: string, input: any) {
        try {
          const token = await tp.getAccessToken();
          const publishSettings: any = {};
          if (input.isPublished !== undefined) publishSettings.isPublished = input.isPublished === 'true';
          if (input.isAcceptingResponses !== undefined) publishSettings.isAcceptingResponses = input.isAcceptingResponses === 'true';
          const result = await formsApi(token, `/forms/${input.formId}:setPublishSettings`, {
            method: 'POST',
            body: { publishSettings },
          });
          return jsonResult({ updated: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
