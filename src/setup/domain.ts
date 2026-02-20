/**
 * Setup Wizard — Step 4: Custom Domain (Optional)
 *
 * Optionally configure a custom domain for the dashboard.
 * Explains the two DNS records needed:
 *   1. CNAME/A record — routes traffic to your server
 *   2. TXT record — proves ownership (handled in Step 5)
 */

export interface DomainSelection {
  customDomain?: string;
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
  console.log(chalk.dim('  Point your own domain at this deployment.\n'));

  // Explain what a custom domain does based on deploy target
  const targetHints: Record<string, string> = {
    cloud: 'Your dashboard will be accessible at this domain instead of the default .agenticmail.io URL.',
    docker: 'Configure your reverse proxy (nginx, Caddy, etc.) to route this domain to the Docker container.',
    fly: 'After deploying, run `fly certs add <domain>` to provision TLS for this domain.',
    railway: 'Add this domain in your Railway project settings after deploying.',
  };

  if (targetHints[deployTarget]) {
    console.log(chalk.dim(`  ${targetHints[deployTarget]}`));
    console.log('');
  }

  const { wantsDomain } = await inquirer.prompt([{
    type: 'confirm',
    name: 'wantsDomain',
    message: 'Add a custom domain?',
    default: false,
  }]);

  if (!wantsDomain) return {};

  const { domain } = await inquirer.prompt([{
    type: 'input',
    name: 'domain',
    message: 'Custom domain:',
    suffix: chalk.dim('  (e.g. agents.agenticmail.io)'),
    validate: (v: string) => {
      const d = v.trim().toLowerCase();
      if (!d.includes('.')) return 'Enter a valid domain (e.g. agents.agenticmail.io)';
      if (d.startsWith('http')) return 'Enter just the domain, not a URL';
      if (d.endsWith('.')) return 'Do not include a trailing dot';
      return true;
    },
    filter: (v: string) => v.trim().toLowerCase(),
  }]);

  // Preview what DNS they'll need
  console.log('');
  console.log(chalk.dim('  After setup, you will need two DNS records for this domain:'));
  console.log('');
  console.log(chalk.dim(`  1. ${chalk.white('CNAME or A record')}  — routes traffic to your server`));
  console.log(chalk.dim(`     (instructions shown after deployment)`));
  console.log(chalk.dim(`  2. ${chalk.white('TXT record')}          — proves domain ownership (next step)`));
  console.log('');

  return { customDomain: domain };
}
