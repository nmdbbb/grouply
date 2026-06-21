import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto('http://localhost:3000');
console.log('Browser open — please log in and navigate to a workspace with tasks');
console.log('Script will auto-screenshot once it detects you are in a workspace...');

// Wait up to 60s for user to log in and navigate to workspace
let workspacePage = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const url = page.url();
  console.log(`[${i*2}s] URL: ${url}`);
  if (url.includes('/project/') || url.includes('/workspace') || url.includes('dashboard')) {
    await page.waitForTimeout(3000); // wait for graph to render
    workspacePage = true;
    break;
  }
}

if (!workspacePage) {
  await page.screenshot({ path: 'public/ss-final.png' });
  console.log('Timed out waiting for workspace — screenshotted current state');
  await browser.close();
  process.exit(0);
}

// We're in a dashboard or workspace
const url = page.url();
console.log('In workspace/dashboard at:', url);

// Take full workspace screenshot
await page.screenshot({ path: 'public/ss-workspace.png', fullPage: false });
console.log('Workspace screenshot saved: public/ss-workspace.png');

// If on dashboard, try to click a project
if (url.includes('dashboard')) {
  const projectLinks = await page.$$('a[href*="/project"]');
  console.log('Project links found:', projectLinks.length);
  if (projectLinks.length > 0) {
    await projectLinks[0].click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'public/ss-project.png' });
    console.log('Project page screenshot: public/ss-project.png');
  }
}

// Try to get graph specifically
await page.waitForTimeout(2000);
const graphContainer = await page.$('.react-flow__renderer, .react-flow, [data-testid="rf__wrapper"]');
if (graphContainer) {
  await graphContainer.screenshot({ path: 'public/ss-graph-only.png' });
  console.log('Graph-only screenshot: public/ss-graph-only.png');
} else {
  await page.screenshot({ path: 'public/ss-graph-full.png' });
  console.log('Full page (no graph el found): public/ss-graph-full.png');
}

await browser.close();
console.log('Done!');
