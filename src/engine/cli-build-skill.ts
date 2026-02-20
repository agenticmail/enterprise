/**
 * CLI: agenticmail-enterprise build-skill
 *
 * Interactive AI-assisted skill scaffolding. Prompts for the target
 * application/service, generates a valid agenticmail-skill.json manifest,
 * validates it, and writes it to disk.
 *
 * If an agent runtime is running locally, uses it for AI generation.
 * Otherwise, falls back to template-based generation.
 */

import { validateSkillManifest, VALID_CATEGORIES, VALID_RISK_LEVELS } from './skill-validator.js';

export async function runBuildSkill(_args: string[]) {
  const chalk = (await import('chalk')).default;
  const ora = (await import('ora')).default;
  const inquirer = (await import('inquirer')).default;
  const fs = await import('fs/promises');
  const path = await import('path');

  console.log('');
  console.log(chalk.bold('\uD83D\uDEE0\uFE0F  AgenticMail Community Skill Builder'));
  console.log(chalk.dim('  Generate a valid agenticmail-skill.json for any application'));
  console.log('');

  // ── Gather inputs ─────────────────────────────────

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'application',
      message: 'What application or service should this skill integrate with?',
      validate: (v: string) => v.trim().length > 0 || 'Application name is required',
    },
    {
      type: 'input',
      name: 'operations',
      message: 'What operations should it support? (comma-separated)',
      default: 'read, create, update, delete, list',
    },
    {
      type: 'list',
      name: 'category',
      message: 'Category:',
      choices: [...VALID_CATEGORIES],
      default: 'productivity',
    },
    {
      type: 'list',
      name: 'risk',
      message: 'Risk level:',
      choices: [...VALID_RISK_LEVELS],
      default: 'medium',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Your GitHub username:',
      validate: (v: string) => /^[a-zA-Z0-9_-]+$/.test(v.trim()) || 'Must be a valid GitHub username',
    },
    {
      type: 'input',
      name: 'outputDir',
      message: 'Output directory:',
      default: (a: any) => `./community-skills/${a.application.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    },
  ]);

  const appSlug = answers.application.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const toolPrefix = appSlug.replace(/-/g, '_');
  const operations = answers.operations.split(',').map((s: string) => s.trim()).filter(Boolean);

  // ── Try AI generation via local agent runtime ─────

  let manifest: any = null;
  const spinner = ora('Generating skill manifest...').start();

  try {
    // Check if agent runtime is running locally
    const res = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      spinner.text = 'Agent runtime detected — using AI to generate manifest...';
      const aiRes = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildAIPrompt(answers.application, operations, answers.category, answers.risk, answers.author, appSlug, toolPrefix),
          system: 'You are a skill manifest generator. Respond with ONLY valid JSON, no markdown, no explanation.',
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const content = aiData.response || aiData.message || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          manifest = JSON.parse(jsonMatch[0]);
        }
      }
    }
  } catch {
    // Agent runtime not available — fall back to template
  }

  // ── Fallback: template-based generation ───────────

  if (!manifest) {
    spinner.text = 'Generating from template...';
    manifest = generateFromTemplate(answers.application, operations, answers.category, answers.risk, answers.author, appSlug, toolPrefix);
  }

  spinner.succeed('Manifest generated');

  // ── Validate ──────────────────────────────────────

  const validation = validateSkillManifest(manifest);
  if (!validation.valid) {
    console.log(chalk.yellow('\n  Validation warnings (auto-fixing)...'));
    // Try to fix common issues
    if (!manifest.category) manifest.category = answers.category;
    if (!manifest.risk) manifest.risk = answers.risk;
    if (!manifest.license) manifest.license = 'MIT';
    if (!manifest.description || manifest.description.length < 20) {
      manifest.description = `Integrates with ${answers.application} to ${operations.slice(0, 3).join(', ')} and more.`;
    }
  }

  // ── Write files ───────────────────────────────────

  const outDir = path.resolve(answers.outputDir);
  await fs.mkdir(outDir, { recursive: true });

  const manifestPath = path.join(outDir, 'agenticmail-skill.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(chalk.green('  \u2714') + ` Written: ${manifestPath}`);

  const readmePath = path.join(outDir, 'README.md');
  await fs.writeFile(readmePath, generateReadme(manifest));
  console.log(chalk.green('  \u2714') + ` Written: ${readmePath}`);

  // Final validation
  const finalCheck = validateSkillManifest(manifest);
  if (finalCheck.valid) {
    console.log(chalk.green('\n  \u2714 Manifest is valid!'));
  } else {
    console.log(chalk.yellow('\n  \u26A0 Manifest has issues:'));
    for (const err of finalCheck.errors) console.log(chalk.red('    ' + err));
  }
  for (const warn of finalCheck.warnings) console.log(chalk.yellow('    \u26A0 ' + warn));

  // ── Offer submission ──────────────────────────────

  console.log('');
  const { submit } = await inquirer.prompt([{
    type: 'confirm',
    name: 'submit',
    message: 'Submit this skill as a PR to agenticmail/enterprise?',
    default: false,
  }]);

  if (submit) {
    const { runSubmitSkill } = await import('./cli-submit-skill.js');
    await runSubmitSkill([outDir]);
  } else {
    console.log(chalk.dim('\n  To submit later: agenticmail-enterprise submit-skill ' + answers.outputDir));
  }
}

// ─── Template Generator ──────────────────────────────

function generateFromTemplate(
  app: string, operations: string[], category: string, risk: string,
  author: string, slug: string, prefix: string,
) {
  const tools = operations.map(op => {
    const opSlug = op.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const isRead = ['read', 'get', 'list', 'search', 'fetch', 'view', 'query'].some(r => opSlug.includes(r));
    const isDelete = ['delete', 'remove', 'destroy'].some(r => opSlug.includes(r));
    const toolCategory = isDelete ? 'destroy' : isRead ? 'read' : 'write';
    const toolRisk = isDelete ? 'high' : isRead ? 'low' : 'medium';
    const sideEffects: string[] = [];
    if (!isRead) sideEffects.push('network-request');
    if (isDelete) sideEffects.push('deletes-data');

    return {
      id: `${prefix}_${opSlug}`,
      name: op.charAt(0).toUpperCase() + op.slice(1),
      description: `${op.charAt(0).toUpperCase() + op.slice(1)} in ${app}`,
      category: toolCategory,
      riskLevel: toolRisk,
      sideEffects,
      parameters: {},
    };
  });

  return {
    id: slug,
    name: app,
    description: `Integrates with ${app} to ${operations.slice(0, 3).join(', ')}${operations.length > 3 ? ' and more' : ''}. Community-contributed skill for AgenticMail agents.`,
    version: '1.0.0',
    author,
    repository: `https://github.com/${author}/${slug}`,
    license: 'MIT',
    category,
    risk,
    tags: [slug, category],
    tools,
    configSchema: {
      apiKey: { type: 'secret', label: 'API Key', description: `Your ${app} API key`, required: true },
    },
    minEngineVersion: '0.3.0',
    homepage: `https://github.com/${author}/${slug}`,
  };
}

// ─── AI Prompt ────────────────────────────────────────

function buildAIPrompt(
  app: string, operations: string[], category: string, risk: string,
  author: string, slug: string, prefix: string,
): string {
  return `Generate a valid agenticmail-skill.json manifest for "${app}".

Requirements:
- id: "${slug}"
- name: "${app}"
- Operations: ${operations.join(', ')}
- category: "${category}"
- risk: "${risk}"
- author: "${author}"
- repository: "https://github.com/${author}/${slug}"
- license: "MIT"
- Each tool needs: id (${prefix}_<action>), name, description, category (read/write/execute/communicate/destroy), riskLevel (low/medium/high/critical), sideEffects array
- Valid sideEffects: sends-email, sends-message, sends-sms, posts-social, runs-code, modifies-files, deletes-data, network-request, controls-device, accesses-secrets, financial
- Include a configSchema with any API keys or settings needed
- version: "1.0.0"
- minEngineVersion: "0.3.0"
- description must be 20-500 chars

Output ONLY the JSON object, no explanation.`;
}

// ─── README Generator ────────────────────────────────

function generateReadme(manifest: any): string {
  const tools = (manifest.tools || []).map((t: any) =>
    `| \`${t.id}\` | ${t.name} | ${t.description} | ${t.riskLevel || 'medium'} |`
  ).join('\n');

  return `# ${manifest.name}

${manifest.description}

## Tools

| ID | Name | Description | Risk |
|----|------|-------------|------|
${tools}

## Configuration

${manifest.configSchema ? Object.entries(manifest.configSchema).map(([k, v]: [string, any]) =>
    `- **${k}** (${v.type || 'string'}): ${v.description || k}${v.required ? ' *(required)*' : ''}`
  ).join('\n') : 'No configuration required.'}

## Installation

Install this skill from the AgenticMail Enterprise dashboard:

1. Go to **Community Skills** in the sidebar
2. Search for "${manifest.name}"
3. Click **Install**

Or via the API:
\`\`\`bash
curl -X POST /api/engine/community/skills/${manifest.id}/install \\
  -H "Content-Type: application/json" \\
  -d '{"orgId": "your-org-id"}'
\`\`\`

## License

${manifest.license || 'MIT'}
`;
}
