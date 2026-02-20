/**
 * CLI: agenticmail-enterprise submit-skill <path>
 *
 * Automates the GitHub PR submission flow for a community skill.
 * Uses the `gh` CLI to fork, branch, commit, push, and open a PR.
 */

import { validateSkillManifest } from './skill-validator.js';

const UPSTREAM_REPO = 'agenticmail/enterprise';

export async function runSubmitSkill(args: string[]) {
  const chalk = (await import('chalk')).default;
  const ora = (await import('ora')).default;
  const { execSync } = await import('child_process');
  const fs = await import('fs/promises');
  const path = await import('path');

  const target = args.filter(a => !a.startsWith('--'))[0];
  if (!target) {
    console.log(`${chalk.bold('Usage:')} agenticmail-enterprise submit-skill <path-to-skill-dir>`);
    process.exit(1);
    return;
  }

  const skillDir = path.resolve(target);

  console.log('');
  console.log(chalk.bold('\uD83D\uDE80 Submit Community Skill'));
  console.log('');

  // ── Step 1: Check gh CLI ──────────────────────────

  const spinner = ora('Checking prerequisites...').start();
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    spinner.fail('GitHub CLI (gh) is not installed');
    console.log('');
    console.log(chalk.dim('  Install it from: https://cli.github.com/'));
    console.log(chalk.dim('  Then run: gh auth login'));
    process.exit(1);
    return;
  }

  // Check gh auth
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    spinner.fail('Not authenticated with GitHub CLI');
    console.log(chalk.dim('  Run: gh auth login'));
    process.exit(1);
    return;
  }
  spinner.succeed('GitHub CLI authenticated');

  // ── Step 2: Validate the skill ────────────────────

  const validateSpinner = ora('Validating skill manifest...').start();
  const manifestPath = path.join(skillDir, 'agenticmail-skill.json');

  let manifest: any;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch (err: any) {
    validateSpinner.fail(`Cannot read manifest: ${err.message}`);
    process.exit(1);
    return;
  }

  const validation = validateSkillManifest(manifest);
  if (!validation.valid) {
    validateSpinner.fail('Manifest validation failed');
    for (const err of validation.errors) {
      console.log(chalk.red('  \u2502 ' + err));
    }
    console.log(chalk.dim('\n  Fix the errors above and try again.'));
    process.exit(1);
    return;
  }
  validateSpinner.succeed(`Manifest valid: ${manifest.name} v${manifest.version}`);

  const skillId = manifest.id;
  const branchName = `community/add-${skillId}`;

  // ── Step 3: Fork the repo ─────────────────────────

  const forkSpinner = ora('Forking repository...').start();
  try {
    execSync(`gh repo fork ${UPSTREAM_REPO} --clone=false 2>&1 || true`, { stdio: 'pipe' });
    forkSpinner.succeed('Repository forked (or already exists)');
  } catch {
    forkSpinner.succeed('Fork exists');
  }

  // Get the fork URL
  let forkUrl: string;
  try {
    const ghUser = execSync('gh api user --jq .login', { encoding: 'utf-8' }).trim();
    forkUrl = `https://github.com/${ghUser}/enterprise.git`;
  } catch {
    forkSpinner.fail('Cannot determine GitHub username');
    process.exit(1);
    return;
  }

  // ── Step 4: Clone, branch, copy, commit, push ─────

  const tmpDir = path.join(process.env.TMPDIR || '/tmp', `agenticmail-submit-${Date.now()}`);
  const pushSpinner = ora('Cloning fork...').start();

  try {
    execSync(`git clone --depth 1 ${forkUrl} "${tmpDir}"`, { stdio: 'pipe' });
    pushSpinner.text = 'Creating branch...';

    const run = (cmd: string) => execSync(cmd, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });

    // Add upstream remote and fetch
    run(`git remote add upstream https://github.com/${UPSTREAM_REPO}.git`);
    run('git fetch upstream main --depth 1');
    run(`git checkout -b ${branchName} upstream/main`);

    // Copy skill directory
    pushSpinner.text = 'Copying skill files...';
    const destDir = path.join(tmpDir, 'community-skills', skillId);
    await fs.mkdir(destDir, { recursive: true });
    const files = await fs.readdir(skillDir);
    for (const file of files) {
      await fs.copyFile(path.join(skillDir, file), path.join(destDir, file));
    }

    // Commit
    pushSpinner.text = 'Committing...';
    run(`git add community-skills/${skillId}/`);
    run(`git commit -m "Add community skill: ${manifest.name}"`);

    // Push
    pushSpinner.text = 'Pushing to fork...';
    run(`git push origin ${branchName} --force`);
    pushSpinner.succeed('Pushed to fork');
  } catch (err: any) {
    pushSpinner.fail(`Git operation failed: ${err.message}`);
    process.exit(1);
    return;
  }

  // ── Step 5: Open PR ───────────────────────────────

  const prSpinner = ora('Opening pull request...').start();

  const toolsList = (manifest.tools || []).map((t: any) =>
    `- \`${t.id}\` — ${t.name}: ${t.description}`
  ).join('\n');

  const prBody = `## Community Skill Submission

**Skill ID:** \`${manifest.id}\`
**Application:** ${manifest.name}
**Category:** ${manifest.category}
**Risk Level:** ${manifest.risk}
**Author:** @${manifest.author}
**License:** ${manifest.license}

### Description

${manifest.description}

### Tools Provided

${toolsList}

### Validation

- [x] Manifest passes \`agenticmail-enterprise validate\`
- [x] All required fields present
- [x] No duplicate tool IDs
${manifest.tags ? `\n**Tags:** ${manifest.tags.join(', ')}` : ''}`;

  try {
    const prUrl = execSync(
      `gh pr create --repo ${UPSTREAM_REPO} --head ${branchName} --title "Add community skill: ${manifest.name}" --body "${prBody.replace(/"/g, '\\"')}"`,
      { cwd: tmpDir, encoding: 'utf-8', stdio: 'pipe' },
    ).trim();
    prSpinner.succeed('Pull request opened!');
    console.log(chalk.green(`\n  ${prUrl}\n`));
  } catch (err: any) {
    // PR might already exist
    if (err.stderr?.includes('already exists')) {
      prSpinner.warn('A PR for this skill already exists');
    } else {
      prSpinner.fail(`Could not open PR: ${err.message}`);
    }
  }

  // Cleanup
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}
