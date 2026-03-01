/**
 * Setup Wizard — Step 4: Custom Domain (Optional)
 *
 * Optionally configure a custom domain for the dashboard.
 * Supports three modes:
 *   1. Subdomain only — <subdomain>.agenticmail.io (default)
 *   2. Root domain — deploy on your main domain (e.g. agenticmail.io)
 *   3. Subdomain of your domain — e.g. agents.yourcompany.com
 */

export interface DomainSelection {
  customDomain?: string;
  /** If true, deploy on root domain without subdomain prefix */
  useRootDomain?: boolean;
}

export async function promptDomain(
  inquirer: any,
  chalk: any,
  deployTarget: string,
): Promise<DomainSelection> {
  // Skip for local deployments
  if (deployTarget === 'local') {
    return {};
  }

  console.log('');
  console.log(chalk.bold.cyan('  Step 4 of 5: Custom Domain'));
  console.log(chalk.dim('  Configure how your team will access the dashboard.\n'));

  // Explain what a custom domain does based on deploy target
  const targetHints: Record<string, string> = {
    cloud: 'By default, your dashboard is at <subdomain>.agenticmail.io. Add a custom domain for a branded URL.',
    docker: 'Configure your reverse proxy (nginx, Caddy, etc.) to route your domain to the Docker container.',
    fly: 'After deploying, run `fly certs add <domain>` to provision TLS for your domain.',
    railway: 'Add your domain in Railway project settings after deploying.',
  };

  if (targetHints[deployTarget]) {
    console.log(chalk.dim(`  ${targetHints[deployTarget]}`));
    console.log('');
  }

  const { domainMode } = await inquirer.prompt([{
    type: 'list',
    name: 'domainMode',
    message: 'Domain setup:',
    choices: [
      {
        name: `Use default subdomain only  ${chalk.dim('(<subdomain>.agenticmail.io)')}`,
        value: 'subdomain_only',
      },
      {
        name: `Add a custom subdomain  ${chalk.dim('(e.g. agents.yourcompany.com)')}`,
        value: 'custom_subdomain',
      },
      {
        name: `Deploy on my root domain  ${chalk.dim('(e.g. yourcompany.com — no subdomain)')}`,
        value: 'root_domain',
      },
    ],
  }]);

  if (domainMode === 'subdomain_only') {
    return {};
  }

  const isRoot = domainMode === 'root_domain';

  const { domain } = await inquirer.prompt([{
    type: 'input',
    name: 'domain',
    message: isRoot ? 'Your domain:' : 'Custom domain:',
    suffix: isRoot
      ? chalk.dim('  (e.g. yourcompany.com)')
      : chalk.dim('  (e.g. agents.yourcompany.com)'),
    validate: (v: string) => {
      const d = v.trim().toLowerCase();
      if (!d.includes('.')) return 'Enter a valid domain (e.g. yourcompany.com)';
      if (d.startsWith('http')) return 'Enter just the domain, not a URL';
      if (d.endsWith('.')) return 'Do not include a trailing dot';
      return true;
    },
    filter: (v: string) => v.trim().toLowerCase(),
  }]);

  if (isRoot) {
    console.log('');
    console.log(chalk.bold('  Root Domain Deployment'));
    console.log(chalk.dim(`  Your dashboard will be accessible at: ${chalk.white('https://' + domain)}`));
    console.log(chalk.dim('  This means the entire domain is dedicated to your AgenticMail deployment.'));
    console.log('');
  }

  // Preview what DNS they'll need
  console.log('');
  console.log(chalk.dim('  After setup, you will need DNS records for this domain:'));
  console.log('');
  if (isRoot) {
    console.log(chalk.dim(`  1. ${chalk.white('A record')}         — point ${domain} to your server IP`));
    console.log(chalk.dim(`     (or CNAME if your provider allows it at the apex)`));
  } else {
    console.log(chalk.dim(`  1. ${chalk.white('CNAME or A record')}  — routes traffic to your server`));
  }
  console.log(chalk.dim(`  2. ${chalk.white('TXT record')}          — proves domain ownership (next step)`));
  console.log('');

  return {
    customDomain: domain,
    useRootDomain: isRoot || undefined,
  };
}
