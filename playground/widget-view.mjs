// Copy of res/layout/widget.xml and RpmWidget.java; the phone draws the real one with RemoteViews.
export function renderWidget(host, {widthDp, fontScale, onOpen, onCapture, onVoice}) {
  const bar = document.createElement('div');
  bar.className = 'widget';
  bar.style.inlineSize = `${widthDp}px`;
  bar.style.setProperty('--font-scale', fontScale);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'widget-open';
  open.setAttribute('aria-label', 'Open planner');
  open.append(Object.assign(document.createElement('img'), {src: '/__playground/widget-butterfly.png', alt: ''}));
  open.onclick = onOpen;

  const capture = document.createElement('div');
  capture.className = 'widget-capture';
  capture.setAttribute('role', 'button');
  capture.tabIndex = 0;
  capture.setAttribute('aria-label', 'Capture a thought');
  capture.onclick = event => { if (!event.target.closest('.widget-voice')) onCapture(); };
  capture.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onCapture(); } };

  const label = document.createElement('span');
  label.className = 'widget-label';
  label.textContent = 150 * fontScale <= widthDp - 132 ? 'Capture a thought' : 'Capture';

  const voice = document.createElement('button');
  voice.type = 'button';
  voice.className = 'widget-voice';
  voice.setAttribute('aria-label', 'Speak a thought');
  const mic = document.createElement('span');
  mic.className = 'widget-mic';
  voice.append(mic);
  voice.onclick = onVoice;

  capture.append(label, voice);
  bar.append(open, capture);
  host.replaceChildren(bar);
}
