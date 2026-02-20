#!/usr/bin/env node
/**
 * AgenticMail Enterprise CLI
 *
 * Commands:
 *   (none) / setup     Interactive setup wizard
 *   validate <path>    Validate a community skill manifest
 *   build-skill        AI-assisted skill scaffolding
 *   submit-skill       Submit a skill as a PR to agenticmail/enterprise
 *   recover            Recover a domain registration on a new machine
 *   verify-domain      Check DNS verification status for your domain
 *
 * Usage:
 *   npx @agenticmail/enterprise
 *   agenticmail-enterprise validate ./community-skills/my-skill/
 *   agenticmail-enterprise validate --all
 *   agenticmail-enterprise build-skill
 *   agenticmail-enterprise submit-skill ./community-skills/my-skill/
 *   agenticmail-enterprise recover --domain agents.agenticmail.io
 *   agenticmail-enterprise verify-domain
 */

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'validate':
    import('./engine/cli-validate.js').then(m => m.runValidate(args.slice(1))).catch(fatal);
    break;

  case 'build-skill':
    import('./engine/cli-build-skill.js').then(m => m.runBuildSkill(args.slice(1))).catch(fatal);
    break;

  case 'submit-skill':
    import('./engine/cli-submit-skill.js').then(m => m.runSubmitSkill(args.slice(1))).catch(fatal);
    break;

  case 'recover':
    import('./domain-lock/cli-recover.js').then(m => m.runRecover(args.slice(1))).catch(fatal);
    break;

  case 'verify-domain':
    import('./domain-lock/cli-verify.js').then(m => m.runVerifyDomain(args.slice(1))).catch(fatal);
    break;

  case '--help':
  case '-h':
    console.log(`
AgenticMail Enterprise CLI

Commands:
  setup                   Interactive setup wizard (default)
  validate <path>         Validate a community skill manifest
    --all                 Validate all skills in community-skills/
    --json                Machine-readable output
  build-skill             AI-assisted skill scaffolding
  submit-skill <path>     Submit a skill as a PR
  recover                 Recover a domain registration on a new machine
  verify-domain           Check DNS verification for your domain

Domain Registration:
  agenticmail-enterprise recover --domain agents.agenticmail.io --key <hex>
  agenticmail-enterprise verify-domain
  agenticmail-enterprise verify-domain --domain agents.agenticmail.io

Skill Development:
  agenticmail-enterprise validate ./community-skills/github-issues/
  agenticmail-enterprise validate --all
  agenticmail-enterprise build-skill
  agenticmail-enterprise submit-skill ./community-skills/my-skill/
`);
    break;

  case 'setup':
  default:
    import('./setup/index.js').then(m => m.runSetupWizard()).catch(fatal);
    break;
}

function fatal(err: Error) {
  console.error('Fatal error:', err.message);
  process.exit(1);
}
