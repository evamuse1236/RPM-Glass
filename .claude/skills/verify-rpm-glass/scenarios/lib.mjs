export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function openBlock(t, name = 'RM critical review drafted') {
  await t.do('open', 'planner');
  await t.do('tap', '--role', 'button', '--name', 'Blocks');
  await t.do('tap', '--name', name);
  await t.do('wait', '--role', 'textbox', '--name', 'Purpose');
}

export async function waitForKeyboard(t) {
  for (let i = 0; i < 20; i++) {
    const inset = await t.read(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')) || 0);
    // Android's own keyboard state, independent of the inset the page uses, so a broken inset bridge cannot pass.
    if (inset > 50 && t.keyboardShown()) return inset;
    await sleep(300);
  }
  t.expect(false, 'The keyboard never opened, so this step cannot test what covers the field', null);
}

// What covers the focused field: the part of the screen under the keyboard, or a bar, snackbar or FAB drawn over it.
export function focusCoverage() {
  const field = document.activeElement;
  if (!field || field === document.body) return {field: null};
  const r = field.getBoundingClientRect();
  const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')) || 0;
  const visibleBottom = innerHeight - inset;
  const overlaps = n => {
    const c = n.getBoundingClientRect();
    return c.height > 0 && c.width > 0 && !n.closest('[hidden]') && getComputedStyle(n).visibility !== 'hidden'
      && c.top < r.bottom - 1 && c.bottom > r.top + 1 && c.left < r.right - 1 && c.right > r.left + 1;
  };
  const covers = [...document.querySelectorAll('#nav-bar, #snackbar, #fab-host > *')].filter(overlaps).map(n => n.id || n.className);
  if (r.bottom > visibleBottom + 1) covers.push('keyboard');
  return {field: field.getAttribute('aria-label') || field.id || field.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom),
    visibleBottom: Math.round(visibleBottom), keyboardInset: Math.round(inset), covers};
}
