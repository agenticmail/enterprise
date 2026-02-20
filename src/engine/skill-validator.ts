/**
 * Community Skill Manifest Validator
 *
 * Standalone strict validator for agenticmail-skill.json manifests.
 * Used by the CLI `validate` command, the CI pipeline, and the
 * CommunitySkillRegistry at publish time.
 *
 * Checks: required fields, format constraints, semver, tool uniqueness,
 * valid categories/risks/side-effects, and duplicate tool ID detection
 * against the entire builtin + community catalog.
 */

// ─── Valid Value Sets ──────────────────────────────────

export const VALID_CATEGORIES = [
  'communication', 'development', 'productivity', 'research', 'media',
  'automation', 'smart-home', 'data', 'security', 'social', 'platform',
  'collaboration', 'crm', 'project-management', 'cloud-infrastructure',
  'devops', 'finance', 'analytics', 'design', 'ecommerce', 'marketing',
  'hr', 'legal', 'customer-support', 'storage', 'database', 'monitoring',
] as const;

export const VALID_TOOL_CATEGORIES = [
  'read', 'write', 'execute', 'communicate', 'destroy',
] as const;

export const VALID_RISK_LEVELS = [
  'low', 'medium', 'high', 'critical',
] as const;

export const VALID_SIDE_EFFECTS = [
  'sends-email', 'sends-message', 'sends-sms', 'posts-social',
  'runs-code', 'modifies-files', 'deletes-data', 'network-request',
  'controls-device', 'accesses-secrets', 'financial',
] as const;

export const VALID_SPDX_LICENSES = [
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC',
  'MPL-2.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0',
  'AGPL-3.0', 'Unlicense', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0',
  'BSL-1.0', '0BSD', 'Artistic-2.0', 'Zlib', 'PSF-2.0',
] as const;

// ─── Regex Patterns ─────────────────────────────────────

const ID_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const TOOL_ID_RE = /^[a-z0-9_]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const AUTHOR_RE = /^[a-zA-Z0-9_-]+$/;
const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;

// ─── Types ──────────────────────────────────────────────

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidateOptions {
  /** Set of existing tool IDs from the builtin catalog (TOOL_INDEX keys) */
  existingToolIds?: Set<string>;
  /** Path to community-skills/ directory for cross-skill duplicate detection */
  communitySkillsDir?: string;
  /** Current engine version for minEngineVersion comparison */
  engineVersion?: string;
  /** Skill ID to exclude from duplicate checks (for re-validation of own manifest) */
  selfSkillId?: string;
}

// ─── Main Validator ─────────────────────────────────────

export function validateSkillManifest(
  manifest: any,
  opts?: ValidateOptions,
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a JSON object'], warnings: [] };
  }

  // ── Required String Fields ────────────────────────

  // id
  if (!manifest.id) {
    errors.push('id is required');
  } else if (typeof manifest.id !== 'string') {
    errors.push('id must be a string');
  } else if (!ID_RE.test(manifest.id)) {
    errors.push('id must be 3-64 chars, lowercase alphanumeric with hyphens/underscores, starting with a letter or digit');
  }

  // name
  if (!manifest.name) {
    errors.push('name is required');
  } else if (typeof manifest.name !== 'string') {
    errors.push('name must be a string');
  } else if (manifest.name.length > 100) {
    errors.push('name must be 100 chars or fewer');
  }

  // description
  if (!manifest.description) {
    errors.push('description is required');
  } else if (typeof manifest.description !== 'string') {
    errors.push('description must be a string');
  } else {
    if (manifest.description.length < 20) errors.push('description must be at least 20 characters');
    if (manifest.description.length > 500) errors.push('description must be 500 chars or fewer');
  }

  // version
  if (!manifest.version) {
    errors.push('version is required');
  } else if (!SEMVER_RE.test(manifest.version)) {
    errors.push('version must be valid semver (e.g. 1.0.0, 2.1.0-beta.1)');
  }

  // author
  if (!manifest.author) {
    errors.push('author is required');
  } else if (!AUTHOR_RE.test(manifest.author)) {
    errors.push('author must be alphanumeric with hyphens/underscores (GitHub username format)');
  }

  // repository
  if (!manifest.repository) {
    errors.push('repository is required');
  } else if (typeof manifest.repository !== 'string') {
    errors.push('repository must be a string');
  } else {
    try {
      new URL(manifest.repository);
    } catch {
      errors.push('repository must be a valid URL');
    }
  }

  // license
  if (!manifest.license) {
    errors.push('license is required');
  } else if (!(VALID_SPDX_LICENSES as readonly string[]).includes(manifest.license)) {
    warnings.push(`Unknown license "${manifest.license}" — common: ${VALID_SPDX_LICENSES.slice(0, 6).join(', ')}`);
  }

  // ── Enum Fields ───────────────────────────────────

  // category
  if (!manifest.category) {
    errors.push('category is required');
  } else if (!(VALID_CATEGORIES as readonly string[]).includes(manifest.category)) {
    errors.push(`Invalid category "${manifest.category}" — valid: ${VALID_CATEGORIES.join(', ')}`);
  }

  // risk
  if (!manifest.risk) {
    errors.push('risk is required');
  } else if (!(VALID_RISK_LEVELS as readonly string[]).includes(manifest.risk)) {
    errors.push(`Invalid risk level "${manifest.risk}" — valid: ${VALID_RISK_LEVELS.join(', ')}`);
  }

  // ── Optional Fields ───────────────────────────────

  // tags
  if (manifest.tags !== undefined) {
    if (!Array.isArray(manifest.tags)) {
      errors.push('tags must be an array');
    } else {
      if (manifest.tags.length > 20) errors.push('Maximum 20 tags allowed');
      for (const tag of manifest.tags) {
        if (typeof tag !== 'string' || !TAG_RE.test(tag)) {
          errors.push(`Invalid tag "${tag}" — must be lowercase alphanumeric with hyphens`);
        }
      }
    }
  }

  // icon
  if (manifest.icon !== undefined && typeof manifest.icon !== 'string') {
    warnings.push('icon should be a string (emoji or URL)');
  }

  // configSchema
  if (manifest.configSchema !== undefined && (typeof manifest.configSchema !== 'object' || Array.isArray(manifest.configSchema))) {
    warnings.push('configSchema should be a JSON object');
  }

  // minEngineVersion
  if (manifest.minEngineVersion) {
    if (!SEMVER_RE.test(manifest.minEngineVersion)) {
      warnings.push('minEngineVersion should be valid semver');
    } else if (opts?.engineVersion && SEMVER_RE.test(opts.engineVersion)) {
      if (compareSemver(manifest.minEngineVersion, opts.engineVersion) > 0) {
        warnings.push(`minEngineVersion ${manifest.minEngineVersion} is newer than current engine ${opts.engineVersion}`);
      }
    }
  }

  // homepage
  if (manifest.homepage) {
    try {
      new URL(manifest.homepage);
    } catch {
      warnings.push('homepage should be a valid URL');
    }
  }

  // ── Tools Array ───────────────────────────────────

  if (!manifest.tools || !Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    errors.push('At least one tool definition is required in the tools array');
  } else {
    const seenToolIds = new Set<string>();

    for (let i = 0; i < manifest.tools.length; i++) {
      const tool = manifest.tools[i];
      const prefix = `tools[${i}]`;

      if (!tool || typeof tool !== 'object') {
        errors.push(`${prefix}: must be an object`);
        continue;
      }

      // tool.id
      if (!tool.id) {
        errors.push(`${prefix}: id is required`);
      } else if (!TOOL_ID_RE.test(tool.id)) {
        errors.push(`${prefix}: id "${tool.id}" must be lowercase alphanumeric with underscores`);
      } else {
        // Check for duplicates within this manifest
        if (seenToolIds.has(tool.id)) {
          errors.push(`${prefix}: duplicate tool id "${tool.id}" within this manifest`);
        }
        seenToolIds.add(tool.id);

        // Check against existing builtin tools
        if (opts?.existingToolIds?.has(tool.id)) {
          errors.push(`${prefix}: tool id "${tool.id}" conflicts with an existing builtin tool`);
        }
      }

      // tool.name
      if (!tool.name) errors.push(`${prefix}: name is required`);

      // tool.description
      if (!tool.description) errors.push(`${prefix}: description is required`);

      // tool.category (ToolCategory)
      if (tool.category && !(VALID_TOOL_CATEGORIES as readonly string[]).includes(tool.category)) {
        warnings.push(`${prefix}: unknown tool category "${tool.category}" — valid: ${VALID_TOOL_CATEGORIES.join(', ')}`);
      }

      // tool.riskLevel
      if (tool.riskLevel && !(VALID_RISK_LEVELS as readonly string[]).includes(tool.riskLevel)) {
        warnings.push(`${prefix}: unknown riskLevel "${tool.riskLevel}" — valid: ${VALID_RISK_LEVELS.join(', ')}`);
      }

      // tool.sideEffects
      if (tool.sideEffects) {
        if (!Array.isArray(tool.sideEffects)) {
          warnings.push(`${prefix}: sideEffects should be an array`);
        } else {
          for (const effect of tool.sideEffects) {
            if (!(VALID_SIDE_EFFECTS as readonly string[]).includes(effect)) {
              warnings.push(`${prefix}: unknown sideEffect "${effect}" — valid: ${VALID_SIDE_EFFECTS.join(', ')}`);
            }
          }
        }
      }

      // tool.parameters
      if (tool.parameters && typeof tool.parameters !== 'object') {
        warnings.push(`${prefix}: parameters should be an object`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Helpers ─────────────────────────────────────────────

/** Compare two semver strings. Returns -1, 0, or 1. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map(Number);
  const pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/**
 * Scan a community-skills/ directory and collect all tool IDs
 * from existing manifests (excluding a given skill ID).
 */
export async function collectCommunityToolIds(
  dirPath: string,
  excludeSkillId?: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      if (excludeSkillId && entry.name === excludeSkillId) continue;

      try {
        const manifestPath = path.join(dirPath, entry.name, 'agenticmail-skill.json');
        const raw = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw);
        if (manifest.tools && Array.isArray(manifest.tools)) {
          for (const tool of manifest.tools) {
            if (tool.id) ids.add(tool.id);
          }
        }
      } catch {
        // Skip invalid/missing manifests
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }
  return ids;
}
