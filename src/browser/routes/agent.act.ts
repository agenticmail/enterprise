import type { BrowserFormField } from "../client-actions-core.js";
import type { BrowserRouteContext } from "../server-context.js";
import {
  type ActKind,
  isActKind,
  parseClickButton,
  parseClickModifiers,
} from "./agent.act.shared.js";
import {
  readBody,
  resolveTargetIdFromBody,
  withPlaywrightRouteContext,
  SELECTOR_UNSUPPORTED_MESSAGE,
} from "./agent.shared.js";
import {
  DEFAULT_DOWNLOAD_DIR,
  DEFAULT_UPLOAD_DIR,
  resolvePathWithinRoot,
  resolvePathsWithinRoot,
} from "./path-output.js";
import type { BrowserResponse, BrowserRouteRegistrar } from "./types.js";
import { jsonError, toBoolean, toNumber, toStringArray, toStringOrEmpty } from "./utils.js";

function resolveDownloadPathOrRespond(res: BrowserResponse, requestedPath: string): string | null {
  const downloadPathResult = resolvePathWithinRoot({
    rootDir: DEFAULT_DOWNLOAD_DIR,
    requestedPath,
    scopeLabel: "downloads directory",
  });
  if (!downloadPathResult.ok) {
    res.status(400).json({ error: downloadPathResult.error });
    return null;
  }
  return downloadPathResult.path;
}

function buildDownloadRequestBase(cdpUrl: string, targetId: string, timeoutMs: number | undefined) {
  return {
    cdpUrl,
    targetId,
    timeoutMs: timeoutMs ?? undefined,
  };
}

function respondWithDownloadResult(res: BrowserResponse, targetId: string, result: unknown) {
  res.json({ ok: true, targetId, download: result });
}

export function registerBrowserAgentActRoutes(
  app: BrowserRouteRegistrar,
  ctx: BrowserRouteContext,
) {
  app.post("/act", async (req, res) => {
    const body = readBody(req);
    const kindRaw = toStringOrEmpty(body.kind);
    if (!isActKind(kindRaw)) {
      return jsonError(res, 400, "kind is required");
    }
    const kind: ActKind = kindRaw;
    const targetId = resolveTargetIdFromBody(body);
    if (Object.hasOwn(body, "selector") && kind !== "wait") {
      return jsonError(res, 400, SELECTOR_UNSUPPORTED_MESSAGE);
    }

    // Server-side timeout: ensure we always respond within 35s
    // Prevents HTTP request from hanging when Playwright operations freeze
    const actTimeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`act:${kind} timed out on server after 40s`)), 40000)
    );
    const actExecution = withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: `act:${kind}`,
      run: async ({ cdpUrl, tab, pw }) => {
        const evaluateEnabled = ctx.state().resolved.evaluateEnabled;

        switch (kind) {
          case "click": {
            const ref = toStringOrEmpty(body.ref);
            if (!ref) {
              return jsonError(res, 400, "ref is required");
            }
            const doubleClick = toBoolean(body.doubleClick) ?? false;
            const timeoutMs = toNumber(body.timeoutMs);
            const buttonRaw = toStringOrEmpty(body.button) || "";
            const button = buttonRaw ? parseClickButton(buttonRaw) : undefined;
            if (buttonRaw && !button) {
              return jsonError(res, 400, "button must be left|right|middle");
            }

            const modifiersRaw = toStringArray(body.modifiers) ?? [];
            const parsedModifiers = parseClickModifiers(modifiersRaw);
            if (parsedModifiers.error) {
              return jsonError(res, 400, parsedModifiers.error);
            }
            const modifiers = parsedModifiers.modifiers;
            const clickRequest: Parameters<typeof pw.clickViaPlaywright>[0] = {
              cdpUrl,
              targetId: tab.targetId,
              ref,
              doubleClick,
            };
            if (button) {
              clickRequest.button = button;
            }
            if (modifiers) {
              clickRequest.modifiers = modifiers;
            }
            if (timeoutMs) {
              clickRequest.timeoutMs = timeoutMs;
            }
            await pw.clickViaPlaywright(clickRequest);
            return res.json({ ok: true, targetId: tab.targetId, url: tab.url });
          }
          case "type": {
            const ref = toStringOrEmpty(body.ref);
            if (!ref) {
              return jsonError(res, 400, "ref is required");
            }
            if (typeof body.text !== "string") {
              return jsonError(res, 400, "text is required");
            }
            const text = body.text;
            const submit = toBoolean(body.submit) ?? false;
            const slowly = toBoolean(body.slowly) ?? false;
            const timeoutMs = toNumber(body.timeoutMs);
            const typeRequest: Parameters<typeof pw.typeViaPlaywright>[0] = {
              cdpUrl,
              targetId: tab.targetId,
              ref,
              text,
              submit,
              slowly,
            };
            if (timeoutMs) {
              typeRequest.timeoutMs = timeoutMs;
            }
            await pw.typeViaPlaywright(typeRequest);
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "press": {
            const key = toStringOrEmpty(body.key);
            if (!key) {
              return jsonError(res, 400, "key is required");
            }
            const delayMs = toNumber(body.delayMs);
            await pw.pressKeyViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              key,
              delayMs: delayMs ?? undefined,
            });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "hover": {
            const ref = toStringOrEmpty(body.ref);
            if (!ref) {
              return jsonError(res, 400, "ref is required");
            }
            const timeoutMs = toNumber(body.timeoutMs);
            await pw.hoverViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              ref,
              timeoutMs: timeoutMs ?? undefined,
            });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "scrollIntoView": {
            const ref = toStringOrEmpty(body.ref);
            if (!ref) {
              return jsonError(res, 400, "ref is required");
            }
            const timeoutMs = toNumber(body.timeoutMs);
            const scrollRequest: Parameters<typeof pw.scrollIntoViewViaPlaywright>[0] = {
              cdpUrl,
              targetId: tab.targetId,
              ref,
            };
            if (timeoutMs) {
              scrollRequest.timeoutMs = timeoutMs;
            }
            await pw.scrollIntoViewViaPlaywright(scrollRequest);
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "drag": {
            const startRef = toStringOrEmpty(body.startRef);
            const endRef = toStringOrEmpty(body.endRef);
            if (!startRef || !endRef) {
              return jsonError(res, 400, "startRef and endRef are required");
            }
            const timeoutMs = toNumber(body.timeoutMs);
            await pw.dragViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              startRef,
              endRef,
              timeoutMs: timeoutMs ?? undefined,
            });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "select": {
            const ref = toStringOrEmpty(body.ref);
            const values = toStringArray(body.values);
            if (!ref || !values?.length) {
              return jsonError(res, 400, "ref and values are required");
            }
            const timeoutMs = toNumber(body.timeoutMs);
            await pw.selectOptionViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              ref,
              values,
              timeoutMs: timeoutMs ?? undefined,
            });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "fill": {
            const rawFields = Array.isArray(body.fields) ? body.fields : [];
            const fields = rawFields
              .map((field) => {
                if (!field || typeof field !== "object") {
                  return null;
                }
                const rec = field as Record<string, unknown>;
                const ref = toStringOrEmpty(rec.ref);
                const type = toStringOrEmpty(rec.type);
                if (!ref || !type) {
                  return null;
                }
                const value =
                  typeof rec.value === "string" ||
                  typeof rec.value === "number" ||
                  typeof rec.value === "boolean"
                    ? rec.value
                    : undefined;
                const parsed: BrowserFormField =
                  value === undefined ? { ref, type } : { ref, type, value };
                return parsed;
              })
              .filter((field): field is BrowserFormField => field !== null);
            if (!fields.length) {
              return jsonError(res, 400, "fields are required");
            }
            const timeoutMs = toNumber(body.timeoutMs);
            await pw.fillFormViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              fields,
              timeoutMs: timeoutMs ?? undefined,
            });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "resize": {
            const width = toNumber(body.width);
            const height = toNumber(body.height);
            if (!width || !height) {
              return jsonError(res, 400, "width and height are required");
            }
            await pw.resizeViewportViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              width,
              height,
            });
            return res.json({ ok: true, targetId: tab.targetId, url: tab.url });
          }
          case "wait": {
            const timeMs = toNumber(body.timeMs);
            const text = toStringOrEmpty(body.text) || undefined;
            const textGone = toStringOrEmpty(body.textGone) || undefined;
            const selector = toStringOrEmpty(body.selector) || undefined;
            const url = toStringOrEmpty(body.url) || undefined;
            const loadStateRaw = toStringOrEmpty(body.loadState);
            const loadState =
              loadStateRaw === "load" ||
              loadStateRaw === "domcontentloaded" ||
              loadStateRaw === "networkidle"
                ? loadStateRaw
                : undefined;
            const fn = toStringOrEmpty(body.fn) || undefined;
            const timeoutMs = toNumber(body.timeoutMs) ?? undefined;
            if (fn && !evaluateEnabled) {
              return jsonError(
                res,
                403,
                [
                  "wait --fn is disabled by config (browser.evaluateEnabled=false).",
                  "Docs: /gateway/configuration#browser-agenticmail-managed-browser",
                ].join("\n"),
              );
            }
            if (
              timeMs === undefined &&
              !text &&
              !textGone &&
              !selector &&
              !url &&
              !loadState &&
              !fn
            ) {
              return jsonError(
                res,
                400,
                "wait requires at least one of: timeMs, text, textGone, selector, url, loadState, fn",
              );
            }
            await pw.waitForViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              timeMs,
              text,
              textGone,
              selector,
              url,
              loadState,
              fn,
              timeoutMs,
            });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "evaluate": {
            if (!evaluateEnabled) {
              return jsonError(
                res,
                403,
                [
                  "act:evaluate is disabled by config (browser.evaluateEnabled=false).",
                  "Docs: /gateway/configuration#browser-agenticmail-managed-browser",
                ].join("\n"),
              );
            }
            const fn = toStringOrEmpty(body.fn);
            if (!fn) {
              return jsonError(res, 400, "fn is required");
            }
            const ref = toStringOrEmpty(body.ref) || undefined;
            const evalTimeoutMs = toNumber(body.timeoutMs);
            const evalRequest: Parameters<typeof pw.evaluateViaPlaywright>[0] = {
              cdpUrl,
              targetId: tab.targetId,
              fn,
              ref,
              signal: req.signal,
            };
            if (evalTimeoutMs !== undefined) {
              evalRequest.timeoutMs = evalTimeoutMs;
            }
            const result = await pw.evaluateViaPlaywright(evalRequest);
            return res.json({
              ok: true,
              targetId: tab.targetId,
              url: tab.url,
              result,
            });
          }
          case "mouse_click": {
            const x = typeof body.x === "number" ? body.x : undefined;
            const y = typeof body.y === "number" ? body.y : undefined;
            if (x === undefined || y === undefined) {
              return jsonError(res, 400, "x and y coordinates are required for mouse_click");
            }
            const button = (body.button === "right" || body.button === "middle") ? body.button : "left";
            await pw.mouseClickViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              x,
              y,
              button: button as "left" | "right" | "middle",
              doubleClick: !!body.doubleClick,
            });
            return res.json({ ok: true, targetId: tab.targetId, url: tab.url });
          }
          case "scroll": {
            const deltaX = typeof body.deltaX === "number" ? body.deltaX : 0;
            const deltaY = typeof body.deltaY === "number" ? body.deltaY : (typeof body.delta === "number" ? body.delta : 0);
            await pw.scrollViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              x: typeof body.x === "number" ? body.x : undefined,
              y: typeof body.y === "number" ? body.y : undefined,
              deltaX,
              deltaY,
            });
            return res.json({ ok: true, targetId: tab.targetId, url: tab.url });
          }
          case "close": {
            await pw.closePageViaPlaywright({ cdpUrl, targetId: tab.targetId });
            return res.json({ ok: true, targetId: tab.targetId });
          }
          case "dismiss": {
            // Smart modal dismissal chain:
            // 1. Press Escape (works on ~90% of modals)
            // 2. Click outside the modal (backdrop click)
            // 3. Find and click Close/X/Cancel/Back button
            const page = await pw.getPageForTargetId({ cdpUrl, targetId: tab.targetId });
            const steps: string[] = [];

            // Step 1: Try Escape
            try {
              await page.keyboard.press("Escape");
              await page.waitForTimeout(500);
              // Check if modal is gone
              const hasDialog = await page.evaluate(() => {
                const d = document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
                return !!d;
              });
              if (!hasDialog) {
                steps.push("Escape key closed the modal");
                return res.json({ ok: true, targetId: tab.targetId, url: tab.url, method: "escape", steps });
              }
              steps.push("Escape key pressed but modal still open");
            } catch { steps.push("Escape key failed"); }

            // Step 2: Try clicking outside the modal (backdrop)
            try {
              const dismissed = await page.evaluate(() => {
                const modal = document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
                if (!modal) return false;
                const rect = modal.getBoundingClientRect();
                // Click at top-left corner of viewport (likely outside modal)
                const x = Math.max(5, rect.left - 20);
                const y = Math.max(5, rect.top - 20);
                const el = document.elementFromPoint(x, y);
                if (el && !modal.contains(el)) {
                  (el as HTMLElement).click();
                  return true;
                }
                return false;
              });
              if (dismissed) {
                await page.waitForTimeout(500);
                const hasDialog = await page.evaluate(() => {
                  return !!document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
                });
                if (!hasDialog) {
                  steps.push("Clicked outside modal to dismiss");
                  return res.json({ ok: true, targetId: tab.targetId, url: tab.url, method: "backdrop_click", steps });
                }
                steps.push("Clicked outside but modal still open");
              }
            } catch { steps.push("Backdrop click failed"); }

            // Step 3: Find Close/X/Cancel/Back button inside modal
            try {
              const closed = await page.evaluate(() => {
                const modal = document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
                const searchRoot = modal || document;
                // Common close button patterns (ordered by priority)
                const selectors = [
                  '[aria-label="Close"]',
                  '[aria-label="close"]',
                  '[aria-label="Dismiss"]',
                  '[aria-label="dismiss"]',
                  '[data-testid="close"]',
                  '[data-testid="Close"]',
                  'button[aria-label*="close" i]',
                  'button[aria-label*="dismiss" i]',
                  'button[aria-label*="cancel" i]',
                ];
                for (const sel of selectors) {
                  const btn = searchRoot.querySelector(sel) as HTMLElement;
                  if (btn) { btn.click(); return sel; }
                }
                // Try finding by text content
                const buttons = searchRoot.querySelectorAll('button, [role="button"], a');
                const closeTexts = ['close', 'cancel', 'dismiss', 'back', 'no thanks', 'not now', 'maybe later', '✕', '×', '✖', 'x'];
                for (const btn of buttons) {
                  const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
                  const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                  if (closeTexts.some(t => text === t || ariaLabel === t)) {
                    (btn as HTMLElement).click();
                    return `text: "${text || ariaLabel}"`;
                  }
                }
                // Try SVG close icons (X patterns)
                const svgButtons = searchRoot.querySelectorAll('button svg, [role="button"] svg');
                for (const svg of svgButtons) {
                  const btn = svg.closest('button, [role="button"]') as HTMLElement;
                  if (btn && btn.offsetWidth < 60 && btn.offsetHeight < 60) {
                    btn.click();
                    return "svg close icon";
                  }
                }
                return null;
              });
              if (closed) {
                await page.waitForTimeout(500);
                steps.push(`Clicked close button (${closed})`);
                return res.json({ ok: true, targetId: tab.targetId, url: tab.url, method: "close_button", matched: closed, steps });
              }
              steps.push("No close button found");
            } catch { steps.push("Close button search failed"); }

            // Step 4: Try pressing Escape again more aggressively
            try {
              await page.keyboard.press("Escape");
              await page.waitForTimeout(300);
              await page.keyboard.press("Escape");
              await page.waitForTimeout(300);
              steps.push("Double Escape pressed");
            } catch { steps.push("Double Escape failed"); }

            return res.json({
              ok: false,
              targetId: tab.targetId,
              url: tab.url,
              error: "Could not dismiss modal after trying: Escape, backdrop click, close button, double Escape",
              steps,
            });
          }
          default: {
            return jsonError(res, 400, "unsupported kind");
          }
        }
      },
    });
    try {
      await Promise.race([actExecution, actTimeout]);
    } catch (err: any) {
      if (!res.headersSent) {
        return jsonError(res, 504, err?.message || 'act operation timed out');
      }
    }
  });

  app.post("/hooks/file-chooser", async (req, res) => {
    const body = readBody(req);
    const targetId = resolveTargetIdFromBody(body);
    const ref = toStringOrEmpty(body.ref) || undefined;
    const inputRef = toStringOrEmpty(body.inputRef) || undefined;
    const element = toStringOrEmpty(body.element) || undefined;
    const paths = toStringArray(body.paths) ?? [];
    const timeoutMs = toNumber(body.timeoutMs);
    if (!paths.length) {
      return jsonError(res, 400, "paths are required");
    }

    await withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: "file chooser hook",
      run: async ({ cdpUrl, tab, pw }) => {
        const uploadPathsResult = resolvePathsWithinRoot({
          rootDir: DEFAULT_UPLOAD_DIR,
          requestedPaths: paths,
          scopeLabel: `uploads directory (${DEFAULT_UPLOAD_DIR})`,
        });
        if (!uploadPathsResult.ok) {
          res.status(400).json({ error: uploadPathsResult.error });
          return;
        }
        const resolvedPaths = uploadPathsResult.paths;

        if (inputRef || element) {
          if (ref) {
            return jsonError(res, 400, "ref cannot be combined with inputRef/element");
          }
          await pw.setInputFilesViaPlaywright({
            cdpUrl,
            targetId: tab.targetId,
            inputRef,
            element,
            paths: resolvedPaths,
          });
        } else {
          await pw.armFileUploadViaPlaywright({
            cdpUrl,
            targetId: tab.targetId,
            paths: resolvedPaths,
            timeoutMs: timeoutMs ?? undefined,
          });
          if (ref) {
            await pw.clickViaPlaywright({
              cdpUrl,
              targetId: tab.targetId,
              ref,
            });
          }
        }
        res.json({ ok: true });
      },
    });
  });

  app.post("/hooks/dialog", async (req, res) => {
    const body = readBody(req);
    const targetId = resolveTargetIdFromBody(body);
    const accept = toBoolean(body.accept);
    const promptText = toStringOrEmpty(body.promptText) || undefined;
    const timeoutMs = toNumber(body.timeoutMs);
    if (accept === undefined) {
      return jsonError(res, 400, "accept is required");
    }

    await withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: "dialog hook",
      run: async ({ cdpUrl, tab, pw }) => {
        await pw.armDialogViaPlaywright({
          cdpUrl,
          targetId: tab.targetId,
          accept,
          promptText,
          timeoutMs: timeoutMs ?? undefined,
        });
        res.json({ ok: true });
      },
    });
  });

  app.post("/wait/download", async (req, res) => {
    const body = readBody(req);
    const targetId = resolveTargetIdFromBody(body);
    const out = toStringOrEmpty(body.path) || "";
    const timeoutMs = toNumber(body.timeoutMs);

    await withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: "wait for download",
      run: async ({ cdpUrl, tab, pw }) => {
        let downloadPath: string | undefined;
        if (out.trim()) {
          const resolvedDownloadPath = resolveDownloadPathOrRespond(res, out);
          if (!resolvedDownloadPath) {
            return;
          }
          downloadPath = resolvedDownloadPath;
        }
        const requestBase = buildDownloadRequestBase(cdpUrl, tab.targetId, timeoutMs);
        const result = await pw.waitForDownloadViaPlaywright({
          ...requestBase,
          path: downloadPath,
        });
        respondWithDownloadResult(res, tab.targetId, result);
      },
    });
  });

  app.post("/download", async (req, res) => {
    const body = readBody(req);
    const targetId = resolveTargetIdFromBody(body);
    const ref = toStringOrEmpty(body.ref);
    const out = toStringOrEmpty(body.path);
    const timeoutMs = toNumber(body.timeoutMs);
    if (!ref) {
      return jsonError(res, 400, "ref is required");
    }
    if (!out) {
      return jsonError(res, 400, "path is required");
    }

    await withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: "download",
      run: async ({ cdpUrl, tab, pw }) => {
        const downloadPath = resolveDownloadPathOrRespond(res, out);
        if (!downloadPath) {
          return;
        }
        const requestBase = buildDownloadRequestBase(cdpUrl, tab.targetId, timeoutMs);
        const result = await pw.downloadViaPlaywright({
          ...requestBase,
          ref,
          path: downloadPath,
        });
        respondWithDownloadResult(res, tab.targetId, result);
      },
    });
  });

  app.post("/response/body", async (req, res) => {
    const body = readBody(req);
    const targetId = resolveTargetIdFromBody(body);
    const url = toStringOrEmpty(body.url);
    const timeoutMs = toNumber(body.timeoutMs);
    const maxChars = toNumber(body.maxChars);
    if (!url) {
      return jsonError(res, 400, "url is required");
    }

    await withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: "response body",
      run: async ({ cdpUrl, tab, pw }) => {
        const result = await pw.responseBodyViaPlaywright({
          cdpUrl,
          targetId: tab.targetId,
          url,
          timeoutMs: timeoutMs ?? undefined,
          maxChars: maxChars ?? undefined,
        });
        res.json({ ok: true, targetId: tab.targetId, response: result });
      },
    });
  });

  app.post("/highlight", async (req, res) => {
    const body = readBody(req);
    const targetId = resolveTargetIdFromBody(body);
    const ref = toStringOrEmpty(body.ref);
    if (!ref) {
      return jsonError(res, 400, "ref is required");
    }

    await withPlaywrightRouteContext({
      req,
      res,
      ctx,
      targetId,
      feature: "highlight",
      run: async ({ cdpUrl, tab, pw }) => {
        await pw.highlightViaPlaywright({
          cdpUrl,
          targetId: tab.targetId,
          ref,
        });
        res.json({ ok: true, targetId: tab.targetId });
      },
    });
  });
}
