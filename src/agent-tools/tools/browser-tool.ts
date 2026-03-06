/**
 * Enterprise Browser Tool
 *
 * Full browser automation for enterprise agents using Playwright.
 * Adapted from AgenticMail's browser system — supports all actions:
 * status, start, stop, profiles, tabs, open, focus, close,
 * snapshot, screenshot, navigate, console, pdf, upload, dialog, act.
 *
 * No restrictions by default — restrictions are configurable per-agent
 * via the dashboard Tools tab and agent config.
 */

import crypto from "node:crypto";
import {
  browserAct,
  browserArmDialog,
  browserArmFileChooser,
  browserConsoleMessages,
  browserNavigate,
  browserPdfSave,
  browserScreenshotAction,
} from "../../browser/client-actions.js";
import {
  browserCloseTab,
  browserFocusTab,
  browserOpenTab,
  browserProfiles,
  browserSnapshot,
  browserStart,
  browserStatus,
  browserStop,
  browserTabs,
} from "../../browser/client.js";
import { DEFAULT_AI_SNAPSHOT_MAX_CHARS } from "../../browser/constants.js";
import { DEFAULT_UPLOAD_DIR, resolvePathsWithinRoot, wrapExternalContent } from "../../browser/enterprise-compat.js";
import { BrowserToolSchema } from "./browser-tool.schema.js";
import { type AnyAgentTool, imageResultFromFile, jsonResult, readStringParam } from "../common.js";

function wrapBrowserExternalJson(params: {
  kind: "snapshot" | "console" | "tabs";
  payload: unknown;
  includeWarning?: boolean;
}): { wrappedText: string; safeDetails: Record<string, unknown> } {
  const extractedText = JSON.stringify(params.payload, null, 2);
  const wrappedText = wrapExternalContent(extractedText, {
    source: "browser",
    includeWarning: params.includeWarning ?? true,
  });
  return {
    wrappedText,
    safeDetails: {
      ok: true,
      externalContent: {
        untrusted: true,
        source: "browser",
        kind: params.kind,
        wrapped: true,
      },
    },
  };
}

/** Enterprise browser tool configuration */
export interface EnterpriseBrowserToolConfig {
  /** Base URL for browser control server (default: auto-detect) */
  baseUrl?: string;
  /** Default profile to use */
  defaultProfile?: string;
  /** Allow JavaScript evaluation */
  allowEvaluate?: boolean;
  /** Allow file:// URLs */
  allowFileUrls?: boolean;
  /** Allow navigation to any URL (no SSRF protection) */
  allowAllUrls?: boolean;
  /** Blocked URL patterns */
  blockedUrlPatterns?: string[];
  /** Max screenshot size */
  maxScreenshotBytes?: number;
  /** Upload directory root */
  uploadDir?: string;
}

export function createEnterpriseBrowserTool(config?: EnterpriseBrowserToolConfig): AnyAgentTool {
  const baseUrl = config?.baseUrl;
  const defaultProfile = config?.defaultProfile;

  return {
    label: "Browser",
    name: "browser",
    description: [
      "Control the browser for web automation — navigate, screenshot, snapshot (accessibility tree), click, type, hover, drag, fill forms, manage tabs, capture console logs, save PDFs, upload files, and handle dialogs.",
      "Actions: status, start, stop, profiles, tabs, open, focus, close, snapshot, screenshot, navigate, console, pdf, upload, dialog, act.",
      "Use snapshot+act for UI automation. snapshot returns the page accessibility tree; use refs from it with act to interact.",
      'snapshot format="ai" returns a text description; format="aria" returns structured nodes.',
      'act supports: click, type, press, hover, drag, select, fill, resize, wait, evaluate, close, mouse_click, scroll.',
      'mouse_click: coordinate-based clicking (x, y) — use when ref-based click fails on Shadow DOM/custom components. Take a screenshot first to identify coordinates.',
      'scroll: scroll the page (deltaY positive=down, negative=up). Use to navigate long pages before taking snapshots.',
      'For multi-tab workflows, use tabs to list, open to create, focus to switch, close to remove.',
      'Reddit URLs are auto-rewritten to old.reddit.com (avoids Shadow DOM issues).',
      'FALLBACK STRATEGY: If snapshot refs fail → try evaluate with document.querySelector(). If clicks fail → take screenshot, identify coordinates, use mouse_click(x, y). If page is too long → use scroll to navigate, then snapshot again.',
    ].join(" "),
    parameters: BrowserToolSchema as any,
    execute: async (_toolCallId: any, args: any) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const profile = readStringParam(params, "profile") || defaultProfile;

      switch (action) {
        case "status":
          return jsonResult(await browserStatus(baseUrl, { profile }));

        case "start":
          await browserStart(baseUrl, { profile });
          return jsonResult(await browserStatus(baseUrl, { profile }));

        case "stop":
          await browserStop(baseUrl, { profile });
          return jsonResult(await browserStatus(baseUrl, { profile }));

        case "profiles":
          return jsonResult({ profiles: await browserProfiles(baseUrl) });

        case "tabs": {
          const tabs = await browserTabs(baseUrl, { profile });
          const wrapped = wrapBrowserExternalJson({
            kind: "tabs",
            payload: { tabs },
            includeWarning: false,
          });
          return {
            content: [{ type: "text", text: wrapped.wrappedText }],
            details: { ...wrapped.safeDetails, tabCount: tabs.length },
          };
        }

        case "open": {
          const targetUrl = readStringParam(params, "targetUrl", { required: true });
          return jsonResult(await browserOpenTab(baseUrl, targetUrl, { profile }));
        }

        case "focus": {
          const targetId = readStringParam(params, "targetId", { required: true });
          await browserFocusTab(baseUrl, targetId, { profile });
          return jsonResult({ ok: true });
        }

        case "close": {
          const targetId = readStringParam(params, "targetId");
          if (targetId) {
            await browserCloseTab(baseUrl, targetId, { profile });
          } else {
            await browserAct(baseUrl, { kind: "close" }, { profile });
          }
          return jsonResult({ ok: true });
        }

        case "snapshot": {
          const format =
            params.snapshotFormat === "ai" || params.snapshotFormat === "aria"
              ? params.snapshotFormat
              : "ai";
          const mode = params.mode === "efficient" ? "efficient" : undefined;
          const labels = typeof params.labels === "boolean" ? params.labels : undefined;
          const refs = params.refs === "aria" || params.refs === "role" ? params.refs : undefined;
          const hasMaxChars = Object.hasOwn(params, "maxChars");
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const limit =
            typeof params.limit === "number" && Number.isFinite(params.limit) ? params.limit : undefined;
          const maxChars =
            typeof params.maxChars === "number" && Number.isFinite(params.maxChars) && params.maxChars > 0
              ? Math.floor(params.maxChars)
              : undefined;
          const resolvedMaxChars =
            format === "ai"
              ? hasMaxChars
                ? maxChars
                : mode === "efficient"
                  ? undefined
                  : DEFAULT_AI_SNAPSHOT_MAX_CHARS
              : undefined;
          const interactive = typeof params.interactive === "boolean" ? params.interactive : undefined;
          const compact = typeof params.compact === "boolean" ? params.compact : undefined;
          const depth =
            typeof params.depth === "number" && Number.isFinite(params.depth) ? params.depth : undefined;
          const selector = typeof params.selector === "string" ? params.selector.trim() : undefined;
          const frame = typeof params.frame === "string" ? params.frame.trim() : undefined;

          const snapshot = await browserSnapshot(baseUrl, {
            format,
            targetId,
            limit,
            ...(typeof resolvedMaxChars === "number" ? { maxChars: resolvedMaxChars } : {}),
            refs,
            interactive,
            compact,
            depth,
            selector,
            frame,
            labels,
            mode,
            profile,
          });

          if (snapshot.format === "ai") {
            const extractedText = snapshot.snapshot ?? "";
            const wrappedSnapshot = wrapExternalContent(extractedText, {
              source: "browser",
              includeWarning: true,
            });
            const safeDetails = {
              ok: true,
              format: snapshot.format,
              targetId: snapshot.targetId,
              url: snapshot.url,
              truncated: snapshot.truncated,
              stats: snapshot.stats,
              refs: snapshot.refs ? Object.keys(snapshot.refs).length : undefined,
              labels: snapshot.labels,
              labelsCount: snapshot.labelsCount,
              labelsSkipped: snapshot.labelsSkipped,
              imagePath: snapshot.imagePath,
              imageType: snapshot.imageType,
              externalContent: {
                untrusted: true,
                source: "browser",
                kind: "snapshot",
                format: "ai",
                wrapped: true,
              },
            };
            if (labels && snapshot.imagePath) {
              return await imageResultFromFile({
                label: "browser:snapshot",
                path: snapshot.imagePath,
                extraText: wrappedSnapshot,
                details: safeDetails,
              });
            }
            return {
              content: [{ type: "text", text: wrappedSnapshot }],
              details: safeDetails,
            };
          }

          // aria format
          const wrapped = wrapBrowserExternalJson({
            kind: "snapshot",
            payload: snapshot,
          });
          return {
            content: [{ type: "text", text: wrapped.wrappedText }],
            details: {
              ...wrapped.safeDetails,
              format: "aria",
              targetId: snapshot.targetId,
              url: snapshot.url,
              nodeCount: snapshot.nodes.length,
            },
          };
        }

        case "screenshot": {
          const targetId = readStringParam(params, "targetId");
          const fullPage = Boolean(params.fullPage);
          const ref = readStringParam(params, "ref");
          const element = readStringParam(params, "element");
          const type = params.type === "jpeg" ? "jpeg" : "png";
          const result = await browserScreenshotAction(baseUrl, {
            targetId,
            fullPage,
            ref,
            element,
            type,
            profile,
          });
          return await imageResultFromFile({
            label: "browser:screenshot",
            path: result.path,
            details: result,
          });
        }

        case "navigate": {
          const targetUrl = readStringParam(params, "targetUrl", { required: true });
          const targetId = readStringParam(params, "targetId");
          return jsonResult(
            await browserNavigate(baseUrl, {
              url: targetUrl,
              targetId,
              profile,
            }),
          );
        }

        case "console": {
          const level = typeof params.level === "string" ? params.level.trim() : undefined;
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const result = await browserConsoleMessages(baseUrl, { level, targetId, profile });
          const wrapped = wrapBrowserExternalJson({
            kind: "console",
            payload: result,
            includeWarning: false,
          });
          return {
            content: [{ type: "text", text: wrapped.wrappedText }],
            details: {
              ...wrapped.safeDetails,
              targetId: result.targetId,
              messageCount: result.messages.length,
            },
          };
        }

        case "pdf": {
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const result = await browserPdfSave(baseUrl, { targetId, profile });
          return {
            content: [{ type: "text", text: `FILE:${result.path}` }],
            details: result,
          };
        }

        case "upload": {
          const paths = Array.isArray(params.paths) ? params.paths.map((p) => String(p)) : [];
          if (paths.length === 0) throw new Error("paths required");

          const uploadDir = config?.uploadDir || DEFAULT_UPLOAD_DIR;
          const normalizedPaths = resolvePathsWithinRoot(uploadDir, ...paths);

          const ref = readStringParam(params, "ref");
          const inputRef = readStringParam(params, "inputRef");
          const element = readStringParam(params, "element");
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const timeoutMs =
            typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
              ? params.timeoutMs
              : undefined;

          return jsonResult(
            await browserArmFileChooser(baseUrl, {
              paths: normalizedPaths,
              ref,
              inputRef,
              element,
              targetId,
              timeoutMs,
              profile,
            }),
          );
        }

        case "dialog": {
          const accept = Boolean(params.accept);
          const promptText = typeof params.promptText === "string" ? params.promptText : undefined;
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const timeoutMs =
            typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
              ? params.timeoutMs
              : undefined;

          return jsonResult(
            await browserArmDialog(baseUrl, {
              accept,
              promptText,
              targetId,
              timeoutMs,
              profile,
            }),
          );
        }

        case "act": {
          const request = params.request as Record<string, unknown> | undefined;
          if (!request || typeof request !== "object") throw new Error("request required");

          // Check evaluate restrictions
          if (request.kind === "evaluate" && config?.allowEvaluate === false) {
            throw new Error("JavaScript evaluation is disabled for this agent. Enable it in agent config.");
          }

          const result = await browserAct(baseUrl, request as Parameters<typeof browserAct>[1], {
            profile,
          });
          return jsonResult(result);
        }

        default:
          throw new Error(`Unknown browser action: ${action}`);
      }
    },
  };
}
