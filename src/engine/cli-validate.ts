/**
 * CLI: agenticmail-enterprise validate <path>
 *
 * Validates an agenticmail-skill.json manifest against the full spec.
 * Checks for duplicate tool IDs against the builtin catalog and
 * other community skills.
 *
 * Flags:
 *   --all   Validate all skills in community-skills/
 *   --json  Machine-readable JSON output (for CI)
 */

import { validateSkillManifest, collectCommunityToolIds } from './skill-validator.js';
import { ALL_TOOLS } from './tool-catalog.js';

interface ValidationReport {
  path: string;
  skillId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function runValidate(args: string[]) {
  const chalk = (await import('chalk')).default;
  const fs = await import('fs/promises');
  const path = await import('path');

  const jsonMode = args.includes('--json');
  const allMode = args.includes('--all');
  const pathArgs = args.filter(a => !a.startsWith('--'));

  // Build the set of builtin tool IDs
  const builtinIds = new Set(ALL_TOOLS.map(t => t.id));

  // Resolve community-skills/ directory
  const communityDir = path.resolve(process.cwd(), 'community-skills');

  const reports: ValidationReport[] = [];

  if (allMode) {
    // Validate all skills in community-skills/
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(communityDir, { withFileTypes: true });
    } catch {
      if (jsonMode) {
        console.log(JSON.stringify({ error: 'community-skills/ directory not found' }));
      } else {
        console.error(chalk.red('Error: community-skills/ directory not found'));
      }
      process.exit(1);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const skillDir = path.join(communityDir, entry.name);
      const report = await validatePath(skillDir, builtinIds, communityDir);
      reports.push(report);
    }
  } else {
    // Validate specific path(s)
    const target = pathArgs[0];
    if (!target) {
      if (jsonMode) {
        console.log(JSON.stringify({ error: 'No path specified. Usage: agenticmail-enterprise validate <path> [--all] [--json]' }));
      } else {
        console.log(`${chalk.bold('Usage:')} agenticmail-enterprise validate <path>`);
        console.log('');
        console.log('  <path>    Path to a skill directory or agenticmail-skill.json file');
        console.log('  --all     Validate all skills in community-skills/');
        console.log('  --json    Machine-readable JSON output');
      }
      process.exit(1);
      return;
    }

    const report = await validatePath(path.resolve(target), builtinIds, communityDir);
    reports.push(report);
  }

  // Output results
  if (jsonMode) {
    console.log(JSON.stringify({ results: reports, totalErrors: reports.reduce((s, r) => s + r.errors.length, 0) }, null, 2));
  } else {
    console.log('');
    for (const report of reports) {
      if (report.valid) {
        console.log(chalk.green('  \u2714') + ' ' + chalk.bold(report.skillId) + chalk.dim(` (${report.path})`));
      } else {
        console.log(chalk.red('  \u2718') + ' ' + chalk.bold(report.skillId) + chalk.dim(` (${report.path})`));
        for (const err of report.errors) {
          console.log(chalk.red('    \u2502 ') + err);
        }
      }
      for (const warn of report.warnings) {
        console.log(chalk.yellow('    \u26A0 ') + warn);
      }
    }

    console.log('');
    const passed = reports.filter(r => r.valid).length;
    const failed = reports.filter(r => !r.valid).length;
    if (failed > 0) {
      console.log(chalk.red(`  ${failed} failed`) + chalk.dim(`, ${passed} passed, ${reports.length} total`));
    } else {
      console.log(chalk.green(`  ${passed} passed`) + chalk.dim(`, ${reports.length} total`));
    }
    console.log('');
  }

  // Exit with error code if any failed
  if (reports.some(r => !r.valid)) {
    process.exit(1);
  }
}

async function validatePath(
  targetPath: string,
  builtinIds: Set<string>,
  communityDir: string,
): Promise<ValidationReport> {
  const fs = await import('fs/promises');
  const path = await import('path');

  let manifestPath: string;

  // Determine if path is a directory or a JSON file
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      manifestPath = path.join(targetPath, 'agenticmail-skill.json');
    } else {
      manifestPath = targetPath;
    }
  } catch {
    return {
      path: targetPath,
      skillId: path.basename(targetPath),
      valid: false,
      errors: [`Path not found: ${targetPath}`],
      warnings: [],
    };
  }

  // Read and parse
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf-8');
  } catch {
    return {
      path: manifestPath,
      skillId: path.basename(path.dirname(manifestPath)),
      valid: false,
      errors: [`Cannot read: ${manifestPath}`],
      warnings: [],
    };
  }

  let manifest: any;
  try {
    manifest = JSON.parse(raw);
  } catch (err: any) {
    return {
      path: manifestPath,
      skillId: path.basename(path.dirname(manifestPath)),
      valid: false,
      errors: [`Invalid JSON: ${err.message}`],
      warnings: [],
    };
  }

  // Collect community tool IDs (excluding self)
  const communityIds = await collectCommunityToolIds(communityDir, manifest.id);
  const allExistingIds = new Set([...builtinIds, ...communityIds]);

  // Validate
  const result = validateSkillManifest(manifest, { existingToolIds: allExistingIds });

  return {
    path: manifestPath,
    skillId: manifest.id || path.basename(path.dirname(manifestPath)),
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
  };
}
