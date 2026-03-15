/**
 * Indeed Job Application Bot — Headed Chrome
 * Searches multiple queries, filters out accounting firms, clicks Easy Apply.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = path.join(process.env.HOME, '.agenticmail', 'browser-profile-indeed');
const LOG_FILE = '/tmp/indeed-applied.json';

const BLOCKED_COMPANIES = [
  'deloitte', 'kpmg', 'pwc', 'pricewaterhousecoopers', 'ernst & young', 'ey ',
  'grant thornton', 'bdo', 'rsm', 'crowe', 'baker tilly', 'cbiz', 'marcum',
  'moss adams', 'cla', 'cliftonlarsonallen', 'plante moran', 'cherry bekaert',
  'forvis', 'mazars', 'withum', 'armanino', 'eide bailly', 'h&r block',
  'jackson hewitt', 'liberty tax',
];

function isBlockedCompany(company) {
  const lc = company.toLowerCase();
  return BLOCKED_COMPANIES.some(b => lc.includes(b));
}

const SEARCH_QUERIES = [
  'AI Engineer', 'Data Scientist', 'Machine Learning Engineer',
  'Financial Analyst', 'Procurement Analyst', 'Data Analyst',
  'Business Analyst', 'Compliance Analyst', 'Tax Analyst',
  'Full Stack Developer', 'Software Engineer',
];

const LOCATION = 'Charlotte, NC';
const applied = [];

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, name) {
  try { await page.screenshot({ path: `/tmp/indeed-${name}.png` }); } catch {}
}

async function searchJobs(page, query) {
  console.log(`\n🔍 Searching: "${query}" in "${LOCATION}"...`);
  await page.goto(
    `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(LOCATION)}&radius=50&fromage=14`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await delay(3000);

  const jobs = await page.evaluate(() => {
    const cards = document.querySelectorAll('.job_seen_beacon, [data-jk]');
    return Array.from(cards).map(card => {
      const titleEl = card.querySelector('h2 a, .jobTitle a');
      const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
      const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
      return {
        title: titleEl?.textContent?.trim() || '',
        company: companyEl?.textContent?.trim() || '',
        location: locationEl?.textContent?.trim() || '',
        href: titleEl?.href || '',
        jk: card.getAttribute('data-jk') || '',
      };
    }).filter(j => j.title && j.href);
  });

  console.log(`  Found ${jobs.length} listings`);
  return jobs;
}

async function tryApply(page, job, ctx) {
  const company = job.company;
  if (isBlockedCompany(company)) {
    console.log(`  ⛔ SKIP (accounting firm): ${company}`);
    return false;
  }

  // Check if already applied
  if (applied.some(a => a.title === job.title && a.company === job.company)) {
    console.log(`  ⏭ Already applied: ${job.title}`);
    return false;
  }

  console.log(`\n📋 Opening: ${job.title} @ ${company}`);

  // Open job in new tab
  const jobPage = await ctx.newPage();
  try {
    await jobPage.goto(job.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(2000);

    // Look for Apply button
    const applyBtn = await jobPage.$('button#indeedApplyButton') ||
                     await jobPage.$('button[id*="indeedApply"]') ||
                     await jobPage.$('.indeed-apply-button') ||
                     await jobPage.$('button:has-text("Apply now")') ||
                     await jobPage.$('a:has-text("Apply now")') ||
                     await jobPage.$('button:has-text("Apply on company site")') ||
                     await jobPage.$('a:has-text("Apply on company site")');

    if (!applyBtn) {
      console.log(`  ⚠ No apply button found`);
      await screenshot(jobPage, `no-apply-${job.jk || 'unknown'}`);
      await jobPage.close();
      return false;
    }

    const btnText = await applyBtn.textContent();
    console.log(`  🔘 Button: "${btnText.trim()}"`);

    // If "Apply on company site" — opens external link
    if (btnText.toLowerCase().includes('company site')) {
      console.log(`  ↗ External application — clicking to open`);
      await applyBtn.click();
      await delay(3000);

      // Check if new tab opened
      const pages = ctx.pages();
      const newPage = pages[pages.length - 1];
      if (newPage !== jobPage) {
        const url = newPage.url();
        console.log(`  🌐 External URL: ${url}`);

        // Check for email verification requirement
        const pageContent = await newPage.content();
        if (pageContent.includes('verify your email') || pageContent.includes('email verification') || pageContent.includes('confirm your email')) {
          console.log(`  ⛔ Requires email verification — skipping`);
          await newPage.close();
          await jobPage.close();
          return false;
        }

        await screenshot(newPage, `external-${job.jk || Date.now()}`);
        applied.push({ ...job, status: 'external_opened', url, time: new Date().toISOString() });
        // Don't close external page — leave for manual review if needed
      }
      await jobPage.close();
      return true;
    }

    // Indeed Easy Apply
    console.log(`  ✅ Indeed Easy Apply — clicking...`);
    await applyBtn.click();
    await delay(3000);

    // Handle the apply modal/flow
    const allPages = ctx.pages();
    const applyPage = allPages[allPages.length - 1];

    // Check for email verification
    const applyContent = await applyPage.content();
    if (applyContent.includes('verify your email') || applyContent.includes('email verification')) {
      console.log(`  ⛔ Requires email verification — skipping`);
      await applyPage.close();
      if (applyPage !== jobPage) await jobPage.close();
      return false;
    }

    // Take screenshot of the application form
    await screenshot(applyPage, `apply-${job.jk || Date.now()}`);

    // Try to navigate through the apply flow
    let step = 0;
    while (step < 10) {
      step++;
      await delay(2000);

      // Check if we see "Application submitted" or similar
      const text = await applyPage.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (text.includes('Application submitted') || text.includes('application has been submitted') || text.includes('successfully applied')) {
        console.log(`  🎉 APPLICATION SUBMITTED!`);
        applied.push({ ...job, status: 'submitted', time: new Date().toISOString() });
        await screenshot(applyPage, `submitted-${job.jk || Date.now()}`);
        break;
      }

      // Look for Continue / Next / Submit / Apply button
      const continueBtn = await applyPage.$('button:has-text("Continue")') ||
                          await applyPage.$('button:has-text("Next")') ||
                          await applyPage.$('button:has-text("Submit your application")') ||
                          await applyPage.$('button:has-text("Apply")') ||
                          await applyPage.$('button:has-text("Review")') ||
                          await applyPage.$('button[type="submit"]');

      if (continueBtn) {
        const cText = await continueBtn.textContent().catch(() => '');
        console.log(`  → Step ${step}: clicking "${cText.trim()}"...`);

        // If there's a resume upload — check if already attached
        const resumeInput = await applyPage.$('input[type="file"]');
        if (resumeInput) {
          console.log(`  📄 Resume upload detected — using master resume`);
          const resumePath = path.join(process.env.HOME, '.openclaw/workspace/job-search/master-tech-resume.docx');
          if (fs.existsSync(resumePath)) {
            await resumeInput.setInputFiles(resumePath);
            await delay(1000);
          }
        }

        // Fill in any required fields that are empty
        const requiredInputs = await applyPage.$$('input[required]:not([type="file"]):not([type="hidden"])');
        for (const inp of requiredInputs) {
          const val = await inp.inputValue().catch(() => '');
          const name = await inp.getAttribute('name') || await inp.getAttribute('id') || '';
          const placeholder = await inp.getAttribute('placeholder') || '';
          if (!val) {
            // Try to fill based on field name
            const field = (name + ' ' + placeholder).toLowerCase();
            if (field.includes('phone')) await inp.fill('3362763915');
            else if (field.includes('email')) await inp.fill('fola@agenticmail.io');
            else if (field.includes('city') || field.includes('location')) await inp.fill('Charlotte, NC');
            else if (field.includes('name') && field.includes('first')) await inp.fill('Ope');
            else if (field.includes('name') && field.includes('last')) await inp.fill('Olatunji');
            else if (field.includes('linkedin')) await inp.fill('linkedin.com/in/opeolatunji');
            else if (field.includes('salary') || field.includes('compensation')) await inp.fill('90000');
            else if (field.includes('years') || field.includes('experience')) await inp.fill('5');
            else {
              console.log(`  ⚠ Unknown required field: ${name || placeholder}`);
            }
          }
        }

        await continueBtn.click();
        await delay(2000);
        await screenshot(applyPage, `step${step}-${job.jk || Date.now()}`);
      } else {
        console.log(`  ⚠ No continue button at step ${step}`);
        await screenshot(applyPage, `stuck-${job.jk || Date.now()}`);
        applied.push({ ...job, status: 'stuck_at_step_' + step, time: new Date().toISOString() });
        break;
      }
    }

    if (applyPage !== jobPage) {
      try { await applyPage.close(); } catch {}
    }
    try { await jobPage.close(); } catch {}
    return true;
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    try { await jobPage.close(); } catch {}
    return false;
  }
}

async function main() {
  console.log('🚀 Indeed Job Application Bot');
  console.log(`📍 Location: ${LOCATION}`);
  console.log(`🔍 Queries: ${SEARCH_QUERIES.length}`);
  console.log('---\n');

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1400, height: 900 },
  });

  const page = ctx.pages()[0] || await ctx.newPage();

  // First verify we're logged in
  await page.goto('https://www.indeed.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await delay(2000);
  await screenshot(page, 'home');

  for (const query of SEARCH_QUERIES) {
    try {
      const jobs = await searchJobs(page, query);

      for (const job of jobs) {
        try {
          await tryApply(page, job, ctx);
          await delay(2000); // Rate limit
        } catch (err) {
          console.log(`  ❌ Error with ${job.title}: ${err.message}`);
        }
      }

      // Save progress after each query
      fs.writeFileSync(LOG_FILE, JSON.stringify(applied, null, 2));
      console.log(`\n💾 Progress saved: ${applied.length} jobs processed`);
    } catch (err) {
      console.log(`❌ Search error for "${query}": ${err.message}`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Processed: ${applied.length} jobs`);
  console.log(`Log: ${LOG_FILE}`);

  fs.writeFileSync(LOG_FILE, JSON.stringify(applied, null, 2));

  // Keep browser open
  await new Promise(() => {});
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
