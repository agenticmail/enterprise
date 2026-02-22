/**
 * Setup Wizard — Step 5: Domain Registration & Verification
 *
 * Registers the deployment domain with the AgenticMail central registry
 * to ensure domain uniqueness across all enterprise deployments.
 *
 * Generates a 256-bit deployment key that the customer must save.
 * Initiates DNS TXT record verification for domain ownership proof.
 *
 * After verification, the system runs 100% offline — no phone-home.
 */

import { randomBytes } from 'crypto';

const REGISTRY_BASE_URL = process.env.AGENTICMAIL_REGISTRY_URL
  || 'https://agenticmail.io/enterprise/v1';

// ─── Types ──────────────────────────────────────────────

export interface RegistrationSelection {
  registered: boolean;
  deploymentKeyHash?: string;
  dnsChallenge?: string;
  registrationId?: string;
  verificationStatus: 'skipped' | 'pending_dns' | 'verified';
}

// ─── Step 5 Prompt ──────────────────────────────────────

export async function promptRegistration(
  inquirer: any,
  chalk: any,
  ora: any,
  domain: string | undefined,
  companyName?: string,
  adminEmail?: string,
): Promise<RegistrationSelection> {
  // Skip if no custom domain configured
  if (!domain) {
    return { registered: false, verificationStatus: 'skipped' };
  }

  console.log('');
  console.log(chalk.bold.cyan('  Step 5 of 5: Domain Registration'));
  console.log(chalk.dim('  Protect your deployment from unauthorized duplication.\n'));

  const { wantsRegistration } = await inquirer.prompt([{
    type: 'confirm',
    name: 'wantsRegistration',
    message: `Register ${chalk.bold(domain)} with AgenticMail?`,
    default: true,
  }]);

  if (!wantsRegistration) {
    console.log(chalk.dim('  Skipped. You can register later from the dashboard.\n'));
    return { registered: false, verificationStatus: 'skipped' };
  }

  // ── Generate Deployment Key ────────────────────────

  const spinner = ora('Generating deployment key...').start();

  const { createHash } = await import('crypto');
  const plaintextKey = randomBytes(32).toString('hex'); // 64-char hex
  const keyHash = createHash('sha256').update(plaintextKey).digest('hex');

  spinner.succeed('Deployment key generated');

  // ── Register with Central Registry ─────────────────

  spinner.start('Registering domain with AgenticMail registry...');

  const registryUrl = REGISTRY_BASE_URL.replace(/\/$/, '');
  let registrationId: string | undefined;
  let dnsChallenge: string | undefined;

  try {
    const res = await fetch(`${registryUrl}/domains/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: domain.toLowerCase().trim(),
        keyHash,
        sha256Hash: keyHash,
        orgName: companyName,
        contactEmail: adminEmail,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({})) as any;

    if (res.status === 409) {
      spinner.fail('Domain already registered');
      console.log('');
      console.log(chalk.yellow('  This domain is already registered and verified.'));
      console.log(chalk.dim('  If this is your domain, use: agenticmail-enterprise recover'));
      console.log('');

      const { continueAnyway } = await inquirer.prompt([{
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue setup without registration?',
        default: true,
      }]);

      if (continueAnyway) {
        return { registered: false, verificationStatus: 'skipped' };
      }
      process.exit(1);
    }

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    registrationId = data.registrationId;
    dnsChallenge = data.dnsChallenge;
    spinner.succeed('Domain registered');
  } catch (err: any) {
    spinner.warn('Registry unavailable');
    console.log('');
    console.log(chalk.yellow(`  Could not reach registry: ${err.message}`));
    console.log(chalk.dim('  You can register later with: agenticmail-enterprise verify-domain'));
    console.log('');

    const { continueAnyway } = await inquirer.prompt([{
      type: 'confirm',
      name: 'continueAnyway',
      message: 'Continue setup without registration?',
      default: true,
    }]);

    if (continueAnyway) {
      return { registered: false, verificationStatus: 'skipped' };
    }
    process.exit(1);
  }

  // ── Display Deployment Key ─────────────────────────

  console.log('');
  console.log(chalk.red.bold('  ╔══════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.red.bold('  ║') + chalk.white.bold('  DEPLOYMENT KEY — SAVE THIS NOW                                     ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + '                                                                      ' + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + `  ${chalk.green.bold(plaintextKey)}  ` + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + '                                                                      ' + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.dim('  This key is shown ONCE. Store it securely (password manager,       ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.dim('  vault, printed backup). You need it to recover this domain.        ') + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╚══════════════════════════════════════════════════════════════════════╝'));
  console.log('');

  // ── Display DNS Instructions ───────────────────────

  console.log(chalk.bold('  Add this DNS TXT record to prove domain ownership:'));
  console.log('');
  console.log(`  ${chalk.bold('Host:')}   ${chalk.cyan(`_agenticmail-verify.${domain}`)}`);
  console.log(`  ${chalk.bold('Type:')}   ${chalk.cyan('TXT')}`);
  console.log(`  ${chalk.bold('Value:')}  ${chalk.cyan(dnsChallenge)}`);
  console.log('');
  console.log(chalk.dim('  DNS changes can take up to 48 hours to propagate.'));
  console.log('');

  // ── Confirm key saved ──────────────────────────────

  await inquirer.prompt([{
    type: 'confirm',
    name: 'keySaved',
    message: 'I have saved my deployment key',
    default: false,
  }]);

  // ── Optional: Check DNS Now ────────────────────────

  const { checkNow } = await inquirer.prompt([{
    type: 'confirm',
    name: 'checkNow',
    message: 'Check DNS verification now?',
    default: false,
  }]);

  let verificationStatus: 'pending_dns' | 'verified' = 'pending_dns';

  if (checkNow) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      spinner.start(`Checking DNS (attempt ${attempt}/5)...`);

      try {
        const res = await fetch(`${registryUrl}/domains/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domain.toLowerCase().trim() }),
          signal: AbortSignal.timeout(15_000),
        });

        const data = await res.json().catch(() => ({})) as any;

        if (data.verified) {
          spinner.succeed('Domain verified!');
          verificationStatus = 'verified';
          break;
        }
      } catch {
        // Ignore errors during polling
      }

      if (attempt < 5) {
        spinner.text = `DNS record not found yet. Retrying in 10s (attempt ${attempt}/5)...`;
        await new Promise(r => setTimeout(r, 10_000));
      } else {
        spinner.info('DNS record not found yet');
        console.log(chalk.dim('  Run later: agenticmail-enterprise verify-domain'));
      }
    }
  } else {
    console.log(chalk.dim('  Run when ready: agenticmail-enterprise verify-domain'));
  }

  console.log('');

  return {
    registered: true,
    deploymentKeyHash: keyHash,
    dnsChallenge,
    registrationId,
    verificationStatus,
  };
}
