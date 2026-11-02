// A stylesheet cannot see what colour an element actually ended up on, so it cannot
// tell black text on the dark page from black text on a school template's white panel.
// Forcing either way breaks the other. This reads the real colours and repairs only
// text that is unreadable, which also covers components that have no stable selector.
(() => {
  // Rich content editor iframes are about:blank. An inline colour written into a draft
  // would be saved with it, into the student's submission or the teacher's page.
  if (location.protocol === 'about:') return;

  const MIN_CONTRAST = 3;
  const PREFERRED = { r: 199, g: 205, b: 209 }; // #C7CDD1, the theme's text colour
  const WHITE = { r: 255, g: 255, b: 255 };
  const BLACK = { r: 0, g: 0, b: 0 };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION']);

  const parse = (color) => {
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };

  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
  });

  const luminance = ({ r, g, b }) => {
    const [lr, lg, lb] = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };

  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // The colour behind an element, or null over an image where it cannot be known.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.backgroundImage !== 'none') return null;
      const c = parse(style.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a === 1) break;
      }
    }
    return layers.reduceRight((under, top) => over(top, under), WHITE);
  };

  const pick = (bg) => {
    if (contrast(PREFERRED, bg) >= 4.5) return PREFERRED;
    return contrast(WHITE, bg) >= contrast(BLACK, bg) ? WHITE : BLACK;
  };

  let checked = new WeakSet();

  const repair = (el) => {
    if (!el || checked.has(el) || SKIP.has(el.tagName)) return;
    checked.add(el);
    if (el.closest('[contenteditable="true"]')) return;

    const style = getComputedStyle(el);
    const fg = parse(style.color);
    if (!fg || fg.a === 0) return;
    const bg = backdrop(el);
    if (!bg || contrast(over(fg, bg), bg) >= MIN_CONTRAST) return;

    const { r, g, b } = pick(bg);
    el.style.setProperty('color', `rgb(${r}, ${g}, ${b})`, 'important');
  };

  // Work happens in idle time so a large page like the Gradebook never blocks on it.
  const walkers = [];
  let scheduled = false;

  const drain = (deadline) => {
    scheduled = false;
    while (walkers.length && deadline.timeRemaining() > 0) {
      const walker = walkers[walkers.length - 1];
      const node = walker.nextNode();
      if (!node) walkers.pop();
      else if (node.data.trim()) repair(node.parentElement);
    }
    if (walkers.length) schedule();
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback(drain, { timeout: 500 });
  };

  const scan = (root) => {
    walkers.push(document.createTreeWalker(root, NodeFilter.SHOW_TEXT));
    schedule();
  };

  // No attribute watching, so the guard's own style writes never wake it back up.
  // characterData catches React filling in text on a node that started out empty.
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        if (record.target.parentElement) scan(record.target.parentElement);
        continue;
      }
      for (const node of record.addedNodes) {
        const root = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (root) scan(root);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  const rescan = () => {
    checked = new WeakSet();
    scan(document.body);
  };

  if (document.body) scan(document.body);

  // Late stylesheets can change what is already on screen, so look again.
  addEventListener('load', () => {
    rescan();
    setTimeout(rescan, 2000);
  });
})();
