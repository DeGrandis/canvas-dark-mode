const panel = document.getElementById('site');
const status = document.getElementById('site-status');
const note = document.getElementById('site-note');
const action = document.getElementById('site-action');
const power = document.getElementById('power-switch');
const powerLabel = document.getElementById('power-label');

// Open pages pick the change up through js/switch.js, with no reload.
const showPower = () => {
  powerLabel.textContent = power.checked ? 'Dark mode is on' : 'Dark mode is off everywhere';
  document.body.classList.toggle('off', !power.checked);
};
chrome.storage.local.get('off').then(({ off }) => {
  power.checked = !off;
  showPower();
});
power.addEventListener('change', () => {
  showPower();
  chrome.storage.local.set({ off: !power.checked });
});

const onBuiltInList = (host) =>
  chrome.runtime.getManifest().content_scripts[0].matches.some((pattern) => {
    const [, wildcard, domain] = pattern.match(/^https:\/\/(\*\.)?([^/]+)/);
    return wildcard ? host === domain || host.endsWith(`.${domain}`) : host === domain;
  });

// Only decides the wording. Canvas can change this, and a wrong answer should never stop
// someone from enabling their own school.
async function looksLikeCanvas(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(document.querySelector('link[href*="brandable_css"]')),
    });
    return result;
  } catch {
    return false;
  }
}

function offer(label, onClick) {
  action.textContent = label;
  action.hidden = false;
  action.addEventListener('click', onClick);
}

async function render() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://')) return;

  const host = new URL(tab.url).hostname;
  const site = `https://${host}/*`;
  panel.hidden = false;

  if (onBuiltInList(host)) {
    status.textContent = `Dark mode is on for ${host}.`;
    return;
  }

  if (await chrome.permissions.contains({ origins: [site] })) {
    status.textContent = `Dark mode is on for ${host}.`;
    offer('Turn off for this site', async () => {
      await chrome.permissions.remove({ origins: [site] });
      chrome.tabs.reload(tab.id);
      window.close();
    });
    return;
  }

  status.textContent = `Dark mode is off for ${host}.`;
  note.textContent = (await looksLikeCanvas(tab.id))
    ? 'Your browser will ask to allow access to this one site.'
    : 'This page does not look like Canvas. Your browser will ask to allow access to this one site.';
  offer('Enable on this site', async () => {
    // The service worker picks this up and reloads the page.
    if (await chrome.permissions.request({ origins: [site] })) window.close();
  });
}

render();
