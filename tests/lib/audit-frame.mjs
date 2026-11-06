// Runs in the page. Keep it self contained, it is serialized into each frame.
export function auditFrame() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const ch = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = ({ r, g, b }) =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // Walks up composing translucent layers. A background image means the real
  // colour behind the text is unknown, so those nodes are not judged.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a === 1) break;
      }
    }
    return layers.reduceRight((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  };

  const visible = (el, s) => {
    if (s.visibility !== 'visible' || s.display === 'none') return false;
    for (let n = el; n; n = n.parentElement) {
      if (getComputedStyle(n).opacity === '0') return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    // Canvas's visually hidden text for screen readers.
    if (s.position === 'absolute' && (r.width <= 2 || s.clip !== 'auto')) return false;
    return !el.closest('[class*="screenreader"], .screenreader-only');
  };

  // Hashed class names change on every Canvas deploy, so fold them away.
  const sig = (el) => {
    const classes = [...el.classList]
      .filter((c) => !/^[a-zA-Z]{5}_[a-zA-Z]{4}$/.test(c))
      .map((c) => c.replace(/^css-[a-z0-9]+-/, 'css-*-'))
      .slice(0, 3);
    const id = el.id && !/\d/.test(el.id) ? `#${el.id}` : '';
    return el.tagName.toLowerCase() + id + classes.map((c) => `.${c}`).join('');
  };

  const fails = new Map();
  let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    const el = t.parentElement;
    if (!text || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue;
    const s = getComputedStyle(el);
    if (!visible(el, s)) continue;
    const fg = parse(s.color);
    const bg = backdrop(el);
    if (!fg || !bg || fg.a === 0) continue;
    checked += 1;
    const ratio = contrast(over(fg, bg), bg);
    if (ratio >= 3) continue;
    const key = `${sig(el)} ${hex(fg)} on ${hex(bg)}`;
    const f = fails.get(key) || { key, ratio: +ratio.toFixed(2), count: 0, sample: text.slice(0, 50) };
    f.count += 1;
    fails.set(key, f);
  }

  // Largest elements still painting a light background.
  const vw = innerWidth;
  const vh = Math.max(document.documentElement.scrollHeight, innerHeight);
  let light = [];
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    const c = parse(s.backgroundColor);
    if (!c || c.a < 0.5 || lum(c) < 0.45) continue;
    if (s.visibility !== 'visible' || s.display === 'none') continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area < 1500) continue;
    light.push({ key: `${sig(el)} ${hex(c)}`, area: Math.round(area), share: +(area / (vw * vh)).toFixed(3) });
  }
  light.sort((a, b) => b.area - a.area);
  const seen = new Set();
  light = light.filter((l) => !seen.has(l.key) && seen.add(l.key)).slice(0, 12);

  return {
    checked,
    fails: [...fails.values()].sort((a, b) => b.count - a.count),
    light,
    body: getComputedStyle(document.body).backgroundColor,
  };
}
