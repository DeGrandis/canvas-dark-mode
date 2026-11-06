// Loads the real extension into Chromium, visits real Canvas pages and reports
// unreadable text and leftover light areas. See tests/README.md.
//
//   node audit.mjs                         audit plugin/ against public pages
//   node audit.mjs --ext <dir> --label x   audit another copy of the extension
//   node audit.mjs --schools               every school's real login page
//   node audit.mjs --login <url>           sign in by hand once, keeps the profile
//   node audit.mjs --authed <urls.json>    audit signed-in pages with that profile
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFrame } from './lib/audit-frame.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const ext = resolve(arg('ext', join(here, '..', 'plugin')));
const label = arg('label', 'current');
const authed = arg('authed');
const login = arg('login');
const schools = process.argv.includes('--schools');
const out = join(here, 'out', label);
const profile = join(here, 'out', '.profile');

async function auditUrl(context, url, name) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 900 });
  const result = { name, url };
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    result.status = res?.status();
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);
    result.finalUrl = page.url();
    const frames = [];
    for (const frame of page.frames()) {
      try {
        const r = await frame.evaluate(auditFrame);
        frames.push({ url: frame.url().slice(0, 100), ...r });
      } catch {
        frames.push({ url: frame.url().slice(0, 100), crossOrigin: true });
      }
    }
    result.main = frames[0];
    result.subframes = frames.slice(1).filter((f) => f.crossOrigin || f.checked);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    result.links = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.href))]);
  } catch (e) {
    result.error = String(e).slice(0, 200);
  }
  await page.close();
  return result;
}

async function launch(dir, headless) {
  return chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
}

// Follows one link of each kind from a list page, so detail pages get covered
// without pinning ids that a school could delete.
function detailLinks(results, origin) {
  const kinds = { assignment: /\/assignments\/\d+$/, quiz: /\/quizzes\/\d+$/, page: /\/pages\/[^/?#]+$/, topic: /\/discussion_topics\/\d+$/, item: /\/modules\/items\/\d+$/ };
  const found = {};
  for (const r of results) {
    for (const link of r.links || []) {
      if (!link.startsWith(origin)) continue;
      for (const [kind, re] of Object.entries(kinds)) {
        if (re.test(link)) found[kind] ??= link;
      }
    }
  }
  return found;
}

function manifestHosts() {
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  return manifest.content_scripts[0].matches
    .map((m) => m.replace('https://', '').replace('/*', ''))
    .filter((h) => !h.includes('*'));
}

// Single sign-on bounces many pages to the school's own site, which the extension
// rightly leaves alone, so only pages it styled count.
function onCanvas(r) {
  if (!r.main || r.error) return false;
  const host = new URL(r.finalUrl).hostname;
  return r.status < 400 && manifestHosts().concat('.instructure.com').some((h) => host.endsWith(h));
}

async function main() {
  mkdirSync(out, { recursive: true });

  if (login) {
    mkdirSync(profile, { recursive: true });
    const context = await launch(profile, false);
    const page = await context.newPage();
    await page.goto(login);
    console.log('Sign in, then close the browser window.');
    await new Promise((done) => context.on('close', done));
    return;
  }

  const temp = authed ? null : mkdtempSync(join(tmpdir(), 'cdm-'));
  const context = await launch(authed ? profile : temp, true);
  const results = [];

  try {
    if (authed) {
      for (const [name, url] of Object.entries(JSON.parse(readFileSync(authed, 'utf8')))) {
        results.push(await auditUrl(context, url, name));
      }
    } else if (schools) {
      const hosts = manifestHosts();
      const worker = async () => {
        while (hosts.length) {
          const host = hosts.shift();
          results.push(await auditUrl(context, `https://${host}/login/canvas`, host));
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
    } else {
      const targets = JSON.parse(readFileSync(join(here, 'targets.json'), 'utf8'));
      for (const [host, conf] of Object.entries(targets)) {
        const origin = `https://${host}`;
        const short = host.replace(/^canvas\.|\.edu$/g, '');
        results.push(await auditUrl(context, `${origin}/login/canvas`, `${short}-login`));
        results.push(await auditUrl(context, `${origin}/search/all_courses`, `${short}-catalog`));
        for (const course of conf.courses) {
          const batch = [];
          for (const p of conf.paths) {
            const name = `${short}-${course}-${p.replace(/\W+/g, '_') || 'home'}`;
            batch.push(await auditUrl(context, `${origin}/courses/${course}${p}`, name));
          }
          results.push(...batch);
          for (const [kind, url] of Object.entries(detailLinks(batch, origin))) {
            results.push(await auditUrl(context, url, `${short}-${course}-${kind}`));
          }
        }
      }
    }
  } finally {
    await context.close();
    if (temp) rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
  }

  for (const r of results) delete r.links;
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));

  const reached = results.filter(onCanvas);
  const styled = reached.filter((r) => r.main?.body === 'rgb(31, 31, 31)');
  const merged = new Map();
  for (const r of reached) {
    for (const f of r.main?.fails ?? []) {
      const m = merged.get(f.key) || { ...f, count: 0, pages: 0 };
      m.count += f.count;
      m.pages += 1;
      merged.set(m.key, m);
    }
  }
  const worst = [...merged.values()].sort((a, b) => b.pages - a.pages || b.count - a.count);
  const failing = worst.reduce((n, f) => n + f.count, 0);
  const checked = reached.reduce((n, r) => n + (r.main?.checked ?? 0), 0);
  console.log(`\n[${label}] pages ${reached.length}, styled ${styled.length}, text nodes ${checked}, under 3:1 ${failing}, distinct ${worst.length}`);
  for (const f of worst.slice(0, Number(arg('top', 25)))) {
    console.log(`  ${String(f.pages).padStart(3)}p ${String(f.count).padStart(4)}x ${f.ratio.toFixed(2)} ${f.key}  "${f.sample}"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
