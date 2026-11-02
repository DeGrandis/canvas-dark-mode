// Pass or fail regression checks. Needs no Canvas account:
//   node checks.mjs                 fixture checks, offline
//   node checks.mjs --live          also the nav checks on a real public Canvas page
//   node checks.mjs --ext <dir>     check another copy of the extension
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFrame } from './lib/audit-frame.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flag = process.argv.indexOf('--ext');
const ext = resolve(flag === -1 ? join(here, '..', 'plugin') : process.argv[flag + 1]);
const live = process.argv.includes('--live');

const dark = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return r < 90 && g < 90 && b < 90;
};

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
}

async function fixture(context) {
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
  const html = readFileSync(join(here, 'fixture', 'page.html'), 'utf8')
    .replace('</body>', () => `<script>${bundle.outputFiles[0].text}</script></body>`);

  // A host from the manifest, so the extension injects as it would on a real school.
  const page = await context.newPage();
  await page.route('https://canvas.vt.edu/__fixture', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('https://canvas.vt.edu/__fixture');
  await page.waitForSelector('#files td');
  await page.waitForTimeout(2800);

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

const profile = mkdtempSync(join(tmpdir(), 'cdm-checks-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

try {
  await fixture(context);
  if (live) await liveNav(context);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
