(() => {
  const read = key => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { return {}; } };
  const device = read('rpm-playground:device'), prefs = read('rpm-playground:prefs');
  const dark = !!device.dark;
  const capture = location.pathname === '/index.html';
  const zoom = (device.textScale ?? 1) * (capture ? (prefs.widgetTextScale ?? 100) / 100 : 1);

  const scheme = /prefers-color-scheme\s*:\s*dark/;
  const realMatch = window.matchMedia.bind(window);
  window.matchMedia = query => {
    if (!/prefers-color-scheme/.test(query)) return realMatch(query);
    const noop = () => {};
    return {matches: scheme.test(query) === dark, media: query, onchange: null,
      addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => false};
  };

  // WebView's setTextZoom multiplies every font size and line height (px included) and nothing else.
  const type = /^(font-size|line-height|--(display|headline|title|body|label)-[a-z]+)$/;
  const visit = rules => {
    for (const rule of rules) {
      if (rule.media && scheme.test(rule.media.mediaText)) rule.media.mediaText = dark ? 'all' : 'not all';
      if (rule.cssRules) visit(rule.cssRules);
      if (zoom === 1 || !rule.style) continue;
      for (const name of [...rule.style]) {
        const value = rule.style.getPropertyValue(name);
        if (type.test(name) && value.includes('px')) rule.style.setProperty(name,
          value.replace(/(\d*\.?\d+)px/g, (_, n) => `${+n * zoom}px`), rule.style.getPropertyPriority(name));
      }
    }
  };
  for (const sheet of document.styleSheets) visit(sheet.cssRules);
})();
