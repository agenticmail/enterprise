/**
 * browser-snapshot-cleaner.ts
 *
 * Centralized snapshot cleaning pipeline for enterprise browser tool.
 * Converts raw aria/AI snapshots into compact, LLM-friendly text.
 *
 * Pipeline:
 *   1. Detect format (aria nodes vs AI text vs raw JSON)
 *   2. Normalize to tree nodes
 *   3. Filter noise (empty generics, hidden elements, decorative images)
 *   4. Apply site-specific extractors (Twitter, Facebook, LinkedIn, Reddit, etc.)
 *   5. Render as indented tree text
 *   6. Truncate intelligently (preserve meaningful content boundaries)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AriaNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  depth: number;
  backendDOMNodeId?: number;
}

export interface CleanedSnapshot {
  /** The cleaned, LLM-friendly text representation */
  text: string;
  /** Number of nodes after filtering */
  nodeCount: number;
  /** Number of nodes removed by filtering */
  noiseRemoved: number;
  /** Whether site-specific extraction was applied */
  siteExtractor?: string;
  /** Whether output was truncated */
  truncated?: boolean;
}

export interface CleanerOptions {
  /** URL of the page (used for site-specific extraction) */
  url?: string;
  /** Max output chars (default: 10000) */
  maxChars?: number;
  /** Include refs in output (default: true) */
  includeRefs?: boolean;
  /** Minimum depth to include (default: 0) */
  minDepth?: number;
  /** Max depth to include (default: unlimited) */
  maxDepth?: number;
}

// ─── Noise Filtering ─────────────────────────────────────────────────────────

/** Roles that are purely structural with no semantic meaning */
const NOISE_ROLES = new Set([
  "generic",
  "none",
  "unknown",
  "presentation",
  "separator",
  "group", // often just a wrapper div
]);

/** Roles that are structural but should be kept if they have a name */
const CONDITIONAL_NOISE_ROLES = new Set([
  "region",
  "section",
  "banner",
  "contentinfo",
  "complementary",
  "navigation",
]);

/** Roles that are always meaningful */
const MEANINGFUL_ROLES = new Set([
  "link",
  "button",
  "heading",
  "textbox",
  "text",
  "statictext",
  "paragraph",
  "listitem",
  "img",
  "image",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "tab",
  "tabpanel",
  "menuitem",
  "alert",
  "dialog",
  "article",
  "cell",
  "row",
  "columnheader",
  "rowheader",
  "time",
  "status",
  "progressbar",
  "slider",
  "switch",
  "searchbox",
]);

function isNoiseNode(node: AriaNode): boolean {
  const role = node.role.toLowerCase();
  const hasName = Boolean(node.name?.trim());
  const hasValue = Boolean(node.value?.trim());

  // Always keep meaningful roles
  if (MEANINGFUL_ROLES.has(role)) return false;

  // Pure noise — skip unless it has a name
  if (NOISE_ROLES.has(role) && !hasName && !hasValue) return true;

  // Conditional noise — skip if no name
  if (CONDITIONAL_NOISE_ROLES.has(role) && !hasName) return true;

  // Skip decorative images
  if ((role === "img" || role === "image") && (node.name === "" || node.name === "decorative")) {
    return true;
  }

  return false;
}

// ─── Site-Specific Extractors ────────────────────────────────────────────────

interface SiteExtractor {
  name: string;
  match: (url: string) => boolean;
  /** Transform nodes before rendering. Can reorder, filter, annotate. */
  transform: (nodes: AriaNode[]) => AriaNode[];
  /** Optional: custom rendering for this site */
  render?: (nodes: AriaNode[], opts: CleanerOptions) => string;
}

/**
 * Twitter/X: Focus on tweet content, strip navigation chrome.
 * Twitter's aria tree is deeply nested with lots of generic wrappers.
 */
const twitterExtractor: SiteExtractor = {
  name: "twitter",
  match: (url) => /^https?:\/\/(x\.com|twitter\.com)/i.test(url),
  transform: (nodes) => {
    // Key roles on Twitter:
    // - article: individual tweets
    // - heading: section headers, user names
    // - link: user profiles, tweet links, hashtags
    // - button: like, retweet, reply, follow
    // - textbox: compose tweet/reply
    // - text/statictext: tweet content
    // - group with name: tweet action bar
    // - time: tweet timestamps

    // Remove Twitter navigation noise
    const navNoise = new Set([
      "Home",
      "Explore",
      "Notifications",
      "Messages",
      "Grok",
      "Communities",
      "Premium",
      "Verified Orgs",
      "Profile",
      "More",
      "Post",
      "Lists",
      "Bookmarks",
      "Monetization",
      "Ads",
      "Jobs",
      "Spaces",
      "Settings",
      "Sign out",
    ]);

    return nodes.filter((n) => {
      const name = n.name?.trim() || "";
      // Skip sidebar navigation items
      if (n.role === "link" && navNoise.has(name)) return false;
      // Skip "To view keyboard shortcuts" heading
      if (n.role === "heading" && name.includes("keyboard shortcuts")) return false;
      // Keep everything else — the generic filter handles the rest
      return true;
    });
  },
};

/**
 * Facebook: Focus on posts, strip navigation and ads.
 */
const facebookExtractor: SiteExtractor = {
  name: "facebook",
  match: (url) =>
    /^https?:\/\/(www\.)?(facebook\.com|fb\.com|business\.facebook\.com)/i.test(url),
  transform: (nodes) => {
    const fbNavNoise = new Set([
      "Facebook",
      "Search Facebook",
      "Home",
      "Watch",
      "Marketplace",
      "Groups",
      "Gaming",
      "Menu",
    ]);
    return nodes.filter((n) => {
      const name = n.name?.trim() || "";
      if (n.role === "link" && fbNavNoise.has(name) && n.depth < 3) return false;
      return true;
    });
  },
};

/**
 * LinkedIn: Focus on posts and profiles, strip navigation.
 */
const linkedinExtractor: SiteExtractor = {
  name: "linkedin",
  match: (url) => /^https?:\/\/(www\.)?linkedin\.com/i.test(url),
  transform: (nodes) => {
    const liNavNoise = new Set([
      "LinkedIn",
      "Home",
      "My Network",
      "Jobs",
      "Messaging",
      "Notifications",
      "Me",
      "For Business",
      "Try Premium for ₹0",
    ]);
    return nodes.filter((n) => {
      const name = n.name?.trim() || "";
      if (n.role === "link" && liNavNoise.has(name) && n.depth < 3) return false;
      return true;
    });
  },
};

/**
 * Reddit (old.reddit.com): Focus on posts and comments.
 */
const redditExtractor: SiteExtractor = {
  name: "reddit",
  match: (url) => /^https?:\/\/(old\.|www\.)?reddit\.com/i.test(url),
  transform: (nodes) => nodes, // old.reddit is already clean
};

/**
 * Google Search: Extract search results.
 */
const googleExtractor: SiteExtractor = {
  name: "google",
  match: (url) => /^https?:\/\/(www\.)?google\.\w+\/search/i.test(url),
  transform: (nodes) => {
    // Remove Google chrome
    return nodes.filter((n) => {
      const name = n.name?.trim() || "";
      if (n.role === "link" && ["Gmail", "Images", "Sign in", "About", "Store"].includes(name)) {
        return false;
      }
      return true;
    });
  },
};

const SITE_EXTRACTORS: SiteExtractor[] = [
  twitterExtractor,
  facebookExtractor,
  linkedinExtractor,
  redditExtractor,
  googleExtractor,
];

// ─── Tree Rendering ──────────────────────────────────────────────────────────

function renderTreeText(nodes: AriaNode[], opts: CleanerOptions): string {
  const includeRefs = opts.includeRefs !== false;
  const lines: string[] = [];

  for (const n of nodes) {
    if (opts.minDepth !== undefined && n.depth < opts.minDepth) continue;
    if (opts.maxDepth !== undefined && n.depth > opts.maxDepth) continue;

    const indent = "  ".repeat(n.depth);
    const role = n.role.toLowerCase();

    // Compact rendering based on role
    let line: string;
    if (role === "text" || role === "statictext") {
      // Just show the text content, no role prefix
      const text = n.name || n.value || "";
      if (!text.trim()) continue;
      line = `${indent}"${text}"`;
    } else if (role === "heading") {
      const level = n.description?.match(/level (\d)/)?.[1] || "";
      const levelStr = level ? `[h${level}]` : "";
      line = `${indent}${levelStr} ${n.name || ""}`.trimEnd();
    } else if (role === "link") {
      line = `${indent}[link] ${n.name || "(unnamed)"}`;
    } else if (role === "button") {
      line = `${indent}[button] ${n.name || "(unnamed)"}`;
    } else if (role === "textbox" || role === "searchbox" || role === "combobox") {
      const val = n.value ? ` = "${n.value}"` : "";
      line = `${indent}[input] ${n.name || ""}${val}`;
    } else if (role === "img" || role === "image") {
      line = `${indent}[img] ${n.name || "(no alt)"}`;
    } else if (role === "checkbox" || role === "radio" || role === "switch") {
      const checked = n.value === "true" ? "✓" : "○";
      line = `${indent}[${checked}] ${n.name || ""}`;
    } else if (role === "article") {
      line = `${indent}--- article ---`;
    } else if (role === "time") {
      line = `${indent}${n.name || n.value || ""}`;
    } else {
      // Default: show role + name
      const nameStr = n.name ? ` ${n.name}` : "";
      const valStr = n.value ? ` = "${n.value}"` : "";
      line = `${indent}${role}${nameStr}${valStr}`;
    }

    if (includeRefs) {
      line += ` [${n.ref}]`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

// ─── Smart Truncation ────────────────────────────────────────────────────────

/**
 * Truncate at a meaningful boundary (end of an article, section, or line).
 * Avoids cutting mid-word or mid-node.
 */
function smartTruncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  // Find the last newline before maxChars
  const slice = text.slice(0, maxChars);
  const lastNewline = slice.lastIndexOf("\n");

  // Prefer cutting at an article boundary
  const lastArticle = slice.lastIndexOf("--- article ---");
  const cutPoint =
    lastArticle > maxChars * 0.5
      ? lastArticle
      : lastNewline > maxChars * 0.7
        ? lastNewline
        : maxChars;

  return {
    text: text.slice(0, cutPoint) + "\n... [truncated]",
    truncated: true,
  };
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

/**
 * Clean a raw aria snapshot (nodes array) into compact, LLM-friendly text.
 */
export function cleanAriaSnapshot(nodes: AriaNode[], opts: CleanerOptions = {}): CleanedSnapshot {
  const maxChars = opts.maxChars ?? 10000;
  const url = opts.url ?? "";

  // Step 1: Find site-specific extractor
  const extractor = SITE_EXTRACTORS.find((e) => e.match(url));
  let processed = [...nodes];

  // Step 2: Apply site-specific transforms
  if (extractor) {
    processed = extractor.transform(processed);
  }

  // Step 3: Filter noise
  const beforeCount = processed.length;
  processed = processed.filter((n) => !isNoiseNode(n));
  const noiseRemoved = beforeCount - processed.length;

  // Step 4: Collapse depth gaps (when parent nodes are filtered out)
  // Track minimum depth per node to re-normalize indentation
  if (processed.length > 0) {
    let prevDepth = 0;
    for (let i = 0; i < processed.length; i++) {
      const node = processed[i]!;
      // Don't allow depth to jump by more than 1 from previous
      if (node.depth > prevDepth + 1) {
        node.depth = prevDepth + 1;
      }
      prevDepth = node.depth;
    }
  }

  // Step 5: Render
  const rendered = extractor?.render
    ? extractor.render(processed, opts)
    : renderTreeText(processed, opts);

  // Step 6: Truncate
  const { text, truncated } = smartTruncate(rendered, maxChars);

  return {
    text,
    nodeCount: processed.length,
    noiseRemoved,
    siteExtractor: extractor?.name,
    truncated,
  };
}

/**
 * Clean an AI-format snapshot (text string) — mostly pass-through with optional site filtering.
 */
export function cleanAiSnapshot(text: string, opts: CleanerOptions = {}): CleanedSnapshot {
  const maxChars = opts.maxChars ?? 10000;

  // AI snapshots are already text — just truncate
  const { text: cleaned, truncated } = smartTruncate(text, maxChars);

  return {
    text: cleaned,
    nodeCount: 0,
    noiseRemoved: 0,
    truncated,
  };
}

/**
 * Auto-detect format and clean.
 * Accepts: AriaNode[], AI text string, or raw JSON response.
 */
export function cleanSnapshot(
  data: AriaNode[] | string | { nodes?: AriaNode[]; snapshot?: string; [key: string]: unknown },
  opts: CleanerOptions = {},
): CleanedSnapshot {
  // String input → AI snapshot
  if (typeof data === "string") {
    return cleanAiSnapshot(data, opts);
  }

  // Array input → aria nodes
  if (Array.isArray(data)) {
    return cleanAriaSnapshot(data, opts);
  }

  // Object input → extract nodes or snapshot text
  if (data && typeof data === "object") {
    if (typeof data.snapshot === "string") {
      return cleanAiSnapshot(data.snapshot, opts);
    }
    if (Array.isArray(data.nodes)) {
      return cleanAriaSnapshot(data.nodes, opts);
    }
  }

  // Fallback — stringify
  return cleanAiSnapshot(JSON.stringify(data, null, 2), opts);
}
