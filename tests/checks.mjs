// Pass or fail regression checks. Needs no Canvas account:
//   node checks.mjs                 fixture checks, offline
//   node checks.mjs --live          also the nav checks on a real public Canvas page
//   node checks.mjs --ext <dir>     check another copy of the extension
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFrame } from './lib/audit-frame.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flag = process.argv.indexOf('--ext');
const ext = resolve(flag === -1 ? join(here, '..', 'plugin') : process.argv[flag + 1]);
const live = process.argv.includes('--live');

// A transparent colour reports as rgba(0, 0, 0, 0), which is not dark.
const dark = (rgb) => {
  const [r, g, b, a = 1] = rgb.match(/[\d.]+/g).map(Number);
  return a > 0 && r < 90 && g < 90 && b < 90;
};

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
}

async function fixtureHtml() {
  const bundle = await build({
    entryPoints: [join(here, 'fixture', 'app.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    loader: { '.jsx': 'jsx' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', global: 'window' },
    logLevel: 'error',
  });
  return readFileSync(join(here, 'fixture', 'page.html'), 'utf8')
    .replace('</body>', () => `<script>${bundle.outputFiles[0].text}</script></body>`);
}

async function openFixture(context, host, html) {
  const page = await context.newPage();
  await page.route(`https://${host}/__fixture`, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(`https://${host}/__fixture`);
  await page.waitForSelector('#files td');
  await page.waitForTimeout(2800);
  return page;
}

async function fixture(context, html) {
  // A host from the manifest, so the extension injects as it would on a real school.
  const page = await openFixture(context, 'canvas.vt.edu', html);

  const css = (selector, prop) =>
    page.$eval(selector, (el, p) => getComputedStyle(el)[p], prop);
  const attr = (selector, name) => page.$eval(selector, (el, n) => el.getAttribute(n), name);
  const audit = await page.evaluate(auditFrame);

  check('no text under 3:1 anywhere on the fixture', audit.fails.length === 0,
    JSON.stringify(audit.fails.slice(0, 5)));

  // Files and Gradebook style tables (#99, #122, #146, #156, #199, #215, #217)
  check('InstUI table row is dark', dark(await css('#files tbody tr', 'backgroundColor')));
  check('InstUI table cell shows the row through',
    (await css('#files tbody td', 'backgroundColor')) === 'rgba(0, 0, 0, 0)');
  check('InstUI table header text is light', !dark(await css('#files thead th', 'color')));
  check('file name link is readable', !dark(await css('#files tbody a', 'color')));

  // White boxes around inputs, menus and trays (#143, #208)
  check('InstUI text input is dark',
    dark(await css('[class*="-textInput__facade"]', 'backgroundColor')));
  check('InstUI alert is dark', dark(await css('[class*="-view-alert"]', 'backgroundColor')));
  check('InstUI menu is dark', dark(await css('[class*="-menu"]', 'backgroundColor')));
  check('InstUI tray is dark', dark(await css('[class*="-tray"]', 'backgroundColor')));

  // School colours (#73)
  check('school nav icon colour is overridden', !dark(await css('#nav-icon', 'fill')));
  const button = await css('#link-button [class*="-baseButton__content"]', 'color');
  check('a link styled as a primary button keeps its own text colour',
    button === 'rgb(255, 255, 255)', button);

  // Teacher and school content (#26, #60, #71, #101, #123, #124, #129, #186)
  check('black teacher text on the page is lifted',
    !dark(await css('#black-on-page span', 'color')));
  check('near black teacher text on the page is lifted',
    !dark(await css('#navy-on-page', 'color')));
  check('white panel stays white',
    (await css('#white-panel', 'backgroundColor')) === 'rgb(255, 255, 255)');
  check('dark text on a white panel is left alone',
    (await css('#panel-text', 'color')) === 'rgb(51, 51, 51)');
  check('link on a white panel turns dark', dark(await css('#panel-link', 'color')));
  check('link on a yellow callout turns dark', dark(await css('#callout-link', 'color')));
  check('readable white on purple is left alone',
    (await attr('#purple-heading', 'style')) === 'color: #ffffff;');

  // Code (#154, #173)
  check('code block is dark with light text',
    dark(await css('#pre-block', 'backgroundColor')) && !dark(await css('#pre-block', 'color')));
  check('inline code is dark with light text',
    dark(await css('#code-inline', 'backgroundColor')) && !dark(await css('#code-inline', 'color')));

  // Nothing may be written into a draft, it would be saved into the submission.
  check('guard does not touch contenteditable content',
    (await attr('#editor-span', 'style')) === 'color: #000000;');
  const rce = page.frameLocator('#rce');
  check('no inline style is added in the editor iframe',
    (await rce.locator('#draft').getAttribute('style')) === null
    && (await rce.locator('#draft-black').getAttribute('style')) === 'color: #000000;'
    && (await rce.locator('body').getAttribute('style')) === null);

  // Editor (#2, #17, #77, #161)
  const editor = page.frames().find((f) => f !== page.mainFrame());
  const inEditor = (selector, prop) =>
    editor.$eval(selector, (el, p) => getComputedStyle(el)[p], prop);
  check('editor body is dark', dark(await inEditor('body', 'backgroundColor')));
  check('editor text is light', !dark(await inEditor('#draft', 'color')));
  check('black draft text is readable in the editor', !dark(await inEditor('#draft-black', 'color')));
  check('editor caret is light', !dark(await inEditor('body', 'caretColor')));

  await page.close();
}

async function liveNav(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('https://canvas.wisc.edu/courses/13', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ic-app-header__menu-list-link');
  await page.evaluate(() => document.body.classList.remove('primary-nav-expanded'));

  // #94, #184: the tooltip and the active icon share a variable in Canvas.
  const link = page.locator('.ic-app-header__menu-list-link').nth(1);
  await link.hover();
  await page.waitForTimeout(900);
  const tip = await link.locator('.menu-item__text').evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color };
  });
  check('nav tooltip has light text on a dark box', dark(tip.bg) && !dark(tip.fg), JSON.stringify(tip));
  // Set here rather than up front, the nav re-renders on hover and would drop the class.
  const fill = await page.evaluate(() => {
    const svg = document.querySelector('.ic-app-header__menu-list-item svg');
    svg.closest('li').classList.add('ic-app-header__menu-list-item--active');
    return getComputedStyle(svg).fill;
  });
  check('active nav icon stays light', !dark(fill), fill);

  // #108: the hamburger menu at half width.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('.mobile-header-hamburger').first().click();
  await page.waitForTimeout(1200);
  const audit = await page.evaluate(auditFrame);
  check('no text under 3:1 at half width', audit.fails.length === 0, JSON.stringify(audit.fails.slice(0, 3)));
  // The audit only measures text, and icons take their colour from the button around them.
  const icons = await page.$$eval('[class*="-tray"] button svg', (svgs) =>
    svgs.map((svg) => getComputedStyle(svg).color));
  const faint = icons.filter((c) => {
    const [r, g, b] = c.match(/\d+/g).map(Number);
    return (r + g + b) / 3 < 150;
  });
  check('mobile menu icons are visible', icons.length > 0 && faint.length === 0, `${icons.length} icons: ${faint}`);
  check('no large light panel at half width',
    !audit.light.some((l) => l.share > 0.05), JSON.stringify(audit.light.slice(0, 3)));

  await page.close();
}

// Chromium can still be writing as it exits. A leftover temp folder is not a test failure.
function tidy(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    console.log(`left behind ${dir}`);
  }
}

async function launch(dir) {
  const profile = mkdtempSync(join(tmpdir(), 'cdm-checks-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  context.once('close', () => tidy(profile));
  return context;
}

const serviceWorker = async (context) =>
  context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');

// A real Canvas host that is not on the list.
const unlisted = 'canvas.wustl.edu';

async function openPopup(context, id, browser) {
  const page = await context.newPage();
  await page.addInitScript(({ url, granted, canvas }) => {
    window.calls = { request: [], remove: [], reload: [], closed: 0 };
    window.close = () => { window.calls.closed += 1; };
    chrome.tabs.query = async () => [{ id: 7, url }];
    chrome.tabs.reload = (tabId) => window.calls.reload.push(tabId);
    chrome.scripting.executeScript = async () => [{ result: canvas }];
    chrome.permissions.contains = async () => granted;
    chrome.permissions.request = async (asked) => {
      window.calls.request.push(asked);
      return true;
    };
    chrome.permissions.remove = async (asked) => {
      window.calls.remove.push(asked);
      return true;
    };
  }, browser);
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.waitForTimeout(300);
  return page;
}

// Chrome's permission prompt cannot be driven from a test. The popup runs against a stubbed
// browser API here, which covers what it asks for, and customSiteGrant covers what follows.
async function popupStates(context) {
  const id = new URL((await serviceWorker(context)).url()).hostname;
  const button = (page) => page.locator('#site-action');
  const status = (page) => page.locator('#site-status').textContent();

  let page = await openPopup(context, id, { url: 'chrome://extensions/', granted: false });
  check('popup hides site controls on browser pages', await page.locator('#site').isHidden());
  await page.close();

  page = await openPopup(context, id, { url: 'https://canvas.vt.edu/courses/1', granted: false });
  check('popup shows a listed school as on with nothing to click',
    (await status(page)).includes('on for canvas.vt.edu') && await button(page).isHidden());
  await page.close();

  page = await openPopup(context, id, { url: 'https://example.instructure.com/', granted: false });
  check('popup treats *.instructure.com as listed', await button(page).isHidden());
  await page.close();

  page = await openPopup(context, id, { url: `https://${unlisted}/courses/1`, granted: false, canvas: true });
  check('popup offers to enable an unlisted school',
    (await button(page).textContent()) === 'Enable on this site');
  check('popup does not warn on a real Canvas page',
    !(await page.locator('#site-note').textContent()).includes('does not look like'));
  await button(page).click();
  await page.waitForTimeout(100);
  const asked = await page.evaluate(() => window.calls);
  check('enabling asks for that one site only',
    JSON.stringify(asked.request) === JSON.stringify([{ origins: [`https://${unlisted}/*`] }]),
    JSON.stringify(asked.request));
  await page.close();

  page = await openPopup(context, id, { url: 'https://example.com/', granted: false, canvas: false });
  check('popup warns but still offers on a page that is not Canvas',
    (await page.locator('#site-note').textContent()).includes('does not look like')
    && await button(page).isVisible());
  await page.close();

  page = await openPopup(context, id, { url: `https://${unlisted}/`, granted: true });
  check('popup offers to turn an enabled school off',
    (await button(page).textContent()) === 'Turn off for this site');
  await button(page).click();
  await page.waitForTimeout(100);
  const removed = await page.evaluate(() => window.calls);
  check('turning off removes the site and reloads the tab',
    JSON.stringify(removed.remove) === JSON.stringify([{ origins: [`https://${unlisted}/*`] }])
    && removed.reload[0] === 7, JSON.stringify(removed));
  await page.close();
}

// Nothing here can answer the prompt, but the real API rejects at once if the manifest does
// not cover the request, or if it was not made from a click.
async function realRequest(context) {
  const id = new URL((await serviceWorker(context)).url()).hostname;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.evaluate((site) => {
    window.outcome = 'waiting on prompt';
    document.body.addEventListener('click', () => {
      chrome.permissions.request({ origins: [site] })
        .then((granted) => { window.outcome = `answered ${granted}`; })
        .catch((e) => { window.outcome = `rejected: ${e.message}`; });
    });
  }, `https://${unlisted}/*`);
  await page.mouse.click(10, 10);
  await page.waitForTimeout(800);
  const outcome = await page.evaluate(() => window.outcome);
  check('the browser accepts the real permission request', !outcome.startsWith('rejected'), outcome);
  await page.close();
}

async function customSiteGrant(html) {
  // Declaring the host hands the service worker what it sees after a user approves the prompt.
  const copy = mkdtempSync(join(tmpdir(), 'cdm-granted-'));
  cpSync(ext, copy, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(copy, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [`https://${unlisted}/*`];
  writeFileSync(join(copy, 'manifest.json'), JSON.stringify(manifest));

  const context = await launch(copy);
  try {
    const worker = await serviceWorker(context);
    const registered = () => worker.evaluate(async () =>
      (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
    await worker.evaluate(() => queueSync());
    const site = `https://${unlisted}/*`;
    check('a granted site gets registered', (await registered()).join() === site, await registered());

    const page = await openFixture(context, unlisted, html);
    check('a granted site goes dark',
      dark(await page.$eval('body', (el) => getComputedStyle(el).backgroundColor)));
    check('the contrast guard runs on a granted site',
      !dark(await page.$eval('#black-on-page span', (el) => getComputedStyle(el).color)));
    const editor = page.frames().find((f) => f !== page.mainFrame());
    check('the editor iframe goes dark on a granted site',
      dark(await editor.$eval('body', (el) => getComputedStyle(el).backgroundColor)));
    check('nothing is written into the editor on a granted site',
      (await editor.$eval('#draft', (el) => el.getAttribute('style'))) === null);
    await page.close();

    if (live) {
      const real = await context.newPage();
      await real.goto(`https://${unlisted}/login/canvas`, { waitUntil: 'domcontentloaded' });
      await real.waitForTimeout(3000);
      check('a granted site goes dark on live Canvas',
        dark(await real.$eval('body', (el) => getComputedStyle(el).backgroundColor)));
      const audit = await real.evaluate(auditFrame);
      check('no text under 3:1 on that live school', audit.fails.length === 0,
        JSON.stringify(audit.fails.slice(0, 3)));
      await real.close();
    }

    await worker.evaluate(async () => {
      await chrome.scripting.registerContentScripts([{
        id: 'https://gone.example/*', matches: ['https://gone.example/*'], css: ['css/styles.css'],
      }]);
      await queueSync();
    });
    check('a site that lost access is unregistered', (await registered()).join() === site, await registered());

    await worker.evaluate(async () => {
      await chrome.scripting.unregisterContentScripts();
      await queueSync();
    });
    check('sites are rebuilt after an update clears them', (await registered()).join() === site);
  } finally {
    await context.close();
    tidy(copy);
  }
}

const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
const context = await launch(ext);

try {
  const html = await fixtureHtml();
  await fixture(context, html);
  if (live) await liveNav(context);

  // Anything beyond these would make every existing user re-approve the extension.
  check('permissions add no install warning',
    (manifest.permissions ?? []).every((p) => ['activeTab', 'scripting'].includes(p)));
  check('access to all sites stays optional',
    !manifest.host_permissions && manifest.optional_host_permissions?.[0] === 'https://*/*');
  // The 201 schools in 1.1.6. New schools use Enable on this site instead.
  check('school list does not grow',
    manifest.content_scripts.every((script) => script.matches.length <= 201));

  if (manifest.background) {
    const page = await openFixture(context, unlisted, html);
    check('an unlisted site is left alone until enabled',
      !dark(await page.$eval('body', (el) => getComputedStyle(el).backgroundColor)));
    await page.close();
    await popupStates(context);
    await customSiteGrant(html);
    await realRequest(context);
  } else {
    check('extension can enable sites', false, 'no service worker');
  }
} finally {
  await context.close();
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
