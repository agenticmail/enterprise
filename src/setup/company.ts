/**
 * Setup Wizard — Step 1: Company Info
 *
 * Collects company name, admin email, admin password,
 * and lets the user choose or customize their subdomain.
 */

export interface CompanyInfo {
  companyName: string;
  adminEmail: string;
  adminPassword: string;
  subdomain: string;
}

/** Derive a URL-safe subdomain slug from a company name. */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

/** Generate alternative subdomain suggestions from a company name. */
function generateAlternatives(companyName: string): string[] {
  const base = toSlug(companyName);
  const words = companyName.trim().split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const suggestions = new Set<string>();

  // Primary: full slug
  suggestions.add(base);

  // Abbreviation: first letter of each word (e.g. "AgenticMail Inc" → "ai")
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('');
    if (initials.length >= 2) suggestions.add(initials);
  }

  // First word only (e.g. "agenticmail")
  if (words[0] && words[0] !== base) {
    suggestions.add(words[0]);
  }

  // First word + last word (e.g. "agenticmail-inc")
  if (words.length >= 3) {
    suggestions.add(`${words[0]}-${words[words.length - 1]}`);
  }

  // With common prefixes
  suggestions.add(`team-${base}`);
  suggestions.add(`app-${base}`);
  suggestions.add(`mail-${words[0] || base}`);
  suggestions.add(`ai-${words[0] || base}`);

  // With "hq" suffix
  suggestions.add(`${words[0] || base}-hq`);

  // Remove the primary (it's shown as default) and truncate
  suggestions.delete(base);
  return [...suggestions].map(s => s.slice(0, 63)).slice(0, 5);
}

/** Validate a subdomain string. */
function validateSubdomain(v: string): string | true {
  const s = v.trim();
  if (!s) return 'Subdomain is required';
  if (s.length < 2) return 'Subdomain must be at least 2 characters';
  if (s.length > 63) return 'Subdomain must be 63 characters or fewer';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) {
    return 'Subdomain must be lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)';
  }
  return true;
}

export async function promptCompanyInfo(
  inquirer: any,
  chalk: any,
): Promise<CompanyInfo> {
  console.log(chalk.bold.cyan('  Step 1 of 5: Company Info'));
  console.log(chalk.dim('  Tell us about your organization.\n'));

  const { companyName, adminEmail, adminPassword } = await inquirer.prompt([
    {
      type: 'input',
      name: 'companyName',
      message: 'Company name:',
      validate: (v: string) => {
        if (!v.trim()) return 'Company name is required';
        if (v.length > 100) return 'Company name must be under 100 characters';
        return true;
      },
    },
    {
      type: 'input',
      name: 'adminEmail',
      message: 'Admin email:',
      validate: (v: string) => {
        if (!v.includes('@') || !v.includes('.')) return 'Enter a valid email address';
        return true;
      },
    },
    {
      type: 'password',
      name: 'adminPassword',
      message: 'Admin password:',
      mask: '*',
      validate: (v: string) => {
        if (v.length < 8) return 'Password must be at least 8 characters';
        if (!/[A-Z]/.test(v) && !/[0-9]/.test(v)) {
          return 'Password should contain at least one uppercase letter or number';
        }
        return true;
      },
    },
  ]);

  // ── Subdomain Selection ─────────────────────────────

  const suggested = toSlug(companyName);
  const alternatives = generateAlternatives(companyName);

  console.log('');
  console.log(chalk.bold('  Subdomain'));
  console.log(chalk.dim('  Used for your dashboard URL and internal routing.\n'));

  // Build choices: suggested (default), alternatives, custom option
  const choices = [
    { name: `${suggested}  ${chalk.dim('(recommended)')}`, value: suggested },
    ...alternatives.map(alt => ({ name: alt, value: alt })),
    new inquirer.Separator(),
    { name: `${chalk.italic('Enter my own...')}`, value: '__custom__' },
    { name: `${chalk.italic('Generate more suggestions')}`, value: '__regenerate__' },
  ];

  let subdomain: string = suggested;
  let choosing = true;

  while (choosing) {
    const { subdomainChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'subdomainChoice',
      message: 'Choose a subdomain:',
      choices,
    }]);

    if (subdomainChoice === '__custom__') {
      const { custom } = await inquirer.prompt([{
        type: 'input',
        name: 'custom',
        message: 'Custom subdomain:',
        suffix: chalk.dim('  (lowercase, letters/numbers/hyphens)'),
        validate: validateSubdomain,
        filter: (v: string) => v.trim().toLowerCase(),
      }]);
      subdomain = custom;
      choosing = false;
    } else if (subdomainChoice === '__regenerate__') {
      // Generate a fresh batch with random suffixes
      const base = toSlug(companyName);
      const words = companyName.trim().split(/\s+/).map((w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
      const w = words[0] || base;
      const rand = () => Math.random().toString(36).slice(2, 5);
      const fresh = [
        `${w}-${rand()}`,
        `${base}-${rand()}`,
        `${w}-agents`,
        `${w}-mail`,
        `${w}-platform`,
      ];
      // Replace the middle choices
      choices.splice(1, alternatives.length,
        ...fresh.map(alt => ({ name: alt, value: alt })),
      );
    } else {
      subdomain = subdomainChoice;
      choosing = false;
    }
  }

  console.log(chalk.dim(`  Your subdomain: ${chalk.white(subdomain)}\n`));

  return { companyName, adminEmail, adminPassword, subdomain };
}
