/**
 * Indeed Job Application Bot — Headed Chrome with persistent login
 * Step 1: Launch browser, verify login, search for jobs, screenshot results
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = path.join(process.env.HOME, '.agenticmail', 'browser-profile-indeed');
const SCREENSHOT_DIR = '/tmp';

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `indeed-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function main() {
  const action = process.argv[2] || 'search';

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1400, height: 900 },
  });

  // Use existing page or create new one
  const page = ctx.pages()[0] || await ctx.newPage();

  if (action === 'search') {
    // Navigate to Indeed and search
    const query = process.argv[3] || 'AI Engineer';
    const location = process.argv[4] || 'Charlotte, NC';

    console.log(`Searching Indeed for "${query}" in "${location}"...`);
    await page.goto(`https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&radius=50&fromage=14`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.waitForTimeout(3000);

    const ss = await screenshot(page, 'search');
    console.log(`Screenshot: ${ss}`);

    // Extract job listings
    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll('.job_seen_beacon, .jobsearch-ResultsList > li, [data-jk]');
      const results = [];
      cards.forEach(card => {
        const titleEl = card.querySelector('h2 a, .jobTitle a, [data-jk] a');
        const companyEl = card.querySelector('[data-testid="company-name"], .companyName, .company');
        const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation, .location');
        if (titleEl) {
          results.push({
            title: titleEl.textContent?.trim() || '',
            company: companyEl?.textContent?.trim() || '',
            location: locationEl?.textContent?.trim() || '',
            href: titleEl.href || '',
            jk: card.getAttribute('data-jk') || titleEl.href?.match(/jk=([^&]+)/)?.[1] || '',
          });
        }
      });
      return results;
    });

    console.log(`\nFound ${jobs.length} jobs:`);
    jobs.forEach((j, i) => {
      console.log(`${i+1}. ${j.title} @ ${j.company} (${j.location})`);
    });

    // Output as JSON for piping
    fs.writeFileSync('/tmp/indeed-jobs.json', JSON.stringify(jobs, null, 2));
    console.log('\nJobs saved to /tmp/indeed-jobs.json');
  }

  // Keep browser open
  console.log('\nBROWSER_READY');
  await new Promise(() => {});
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
