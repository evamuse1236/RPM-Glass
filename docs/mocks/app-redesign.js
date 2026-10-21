const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const phone = $('#phone'), nav = $('#nav'), sheet = $('#sheet'), capture = $('#capture');
let water = 2, current = 'today';
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1800); }
function show(id) {
  if (id === 'sheet') { if (current === 'capture') show('today'); sheet.classList.add('on'); mark('sheet'); return; }
  sheet.classList.remove('on');
  capture.classList.toggle('on', id === 'capture');
  if (id !== 'capture') {
    current = id;
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === id));
    $('#back').hidden = id !== 'blocks';
    $('#inline').textContent = $('#' + id).dataset.title;
    $('#' + id).scrollTop = 0; nav.classList.remove('scrolled');
  } else current = 'capture';
  mark(id);
}
function mark(id) { $$('#screens button').forEach(b => b.setAttribute('aria-pressed', b.dataset.go === id)); }
$$('.screen').forEach(s => s.addEventListener('scroll', () => nav.classList.toggle('scrolled', s.scrollTop > 36)));
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go],[data-sheet],[data-close],[data-toast],[data-w]');
  if (!b) { if (current === 'capture' && !e.target.closest('.cpanel') && phone.contains(e.target)) show('today'); return; }
  if (b.dataset.go) show(b.dataset.go);
  else if (b.hasAttribute('data-sheet')) show('sheet');
  else if (b.hasAttribute('data-close')) { sheet.classList.remove('on'); mark(current); }
  else if (b.dataset.w) { water = Math.max(0, Math.min(20, water + +b.dataset.w)); $('#water').textContent = `${water} of 8`; toast(b.dataset.w > 0 ? 'Glass logged. Undo' : 'Glass removed'); }
  else if (b.dataset.toast) toast(b.dataset.toast);
});
$('#back').onclick = () => show('today');
$('#themeT').onclick = e => { const on = phone.classList.toggle('light'); e.currentTarget.setAttribute('aria-pressed', on); };
$('#textT').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); phone.style.zoom = ''; phone.querySelectorAll('.screen, .sheet, .capture').forEach(el => el.style.fontSize = ''); phone.style.setProperty('font-size', on ? '200%' : ''); $$('.screen,.sheet,.cpanel').forEach(el => el.style.zoom = on ? 1.6 : ''); };
