// The popup's on/off switch. Every rule in styles.css is nested under
// html:not([data-dark-mode-off]), so marking <html> turns the theme off with no reload.
// This runs at document_start, so a page opened while off does not flash dark for long.
(() => {
  let off = false;
  const apply = () => document.documentElement?.toggleAttribute('data-dark-mode-off', off);

  // An editor that rewrites its frame with document.write replaces <html>.
  new MutationObserver(apply).observe(document, { childList: true });

  chrome.storage.local.get('off').then((stored) => {
    off = Boolean(stored.off);
    apply();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (!('off' in changes)) return;
    off = Boolean(changes.off.newValue);
    apply();
  });
})();
