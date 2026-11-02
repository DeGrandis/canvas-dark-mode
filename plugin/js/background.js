// Schools outside the manifest's list are switched on from the popup. The popup only asks
// for the site, because the browser may close it when the permission prompt opens. This
// keeps the registered scripts in step with the access the browser reports, which also
// turns a site off when it is removed from the browser's own extension settings.

// The browser's "On all sites" setting arrives as a wildcard. Restyling every site is not
// what anyone is asking for there, so only sites chosen one at a time count.
const customSites = (origins = []) => {
  const builtIn = chrome.runtime.getManifest().content_scripts[0].matches;
  return origins.filter((site) => !builtIn.includes(site) && !site.startsWith('https://*'));
};

async function sync() {
  const { origins } = await chrome.permissions.getAll();
  const wanted = customSites(origins);
  const registered = (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id);

  const stale = registered.filter((id) => !wanted.includes(id));
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });

  const missing = wanted.filter((site) => !registered.includes(site));
  if (missing.length) {
    await chrome.scripting.registerContentScripts(missing.map((site) => ({
      id: site,
      matches: [site],
      css: ['css/styles.css'],
      js: ['js/contrast-guard.js'],
      allFrames: true,
      matchOriginAsFallback: true,
    })));
  }
}

// Events can overlap, and registering an id twice fails the whole call.
let pending = Promise.resolve();
const queueSync = () => (pending = pending.then(sync, sync));

// Registered scripts do not survive an extension update, so this rebuilds them.
chrome.runtime.onInstalled.addListener(queueSync);
chrome.runtime.onStartup.addListener(queueSync);
chrome.permissions.onRemoved.addListener(queueSync);

chrome.permissions.onAdded.addListener(async ({ origins }) => {
  await queueSync();
  const sites = customSites(origins);
  if (!sites.length) return;
  for (const tab of await chrome.tabs.query({ url: sites })) chrome.tabs.reload(tab.id);
});
