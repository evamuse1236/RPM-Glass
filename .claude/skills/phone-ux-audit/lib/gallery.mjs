import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

export function writeGallery({ outDir, shots, videoPath, runId, result, journal = [], videoCheck }) {
  const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const cards = shots
    .map(
      (s) => {
        const failed = s.ok === false || s.expectOk === false;
        const entry = journal.find((j) => j.step === s.id);
        const errors = entry?.actions.filter((a) => !a.ok) ?? [];
        const recovered = entry?.recoveredLauncher || entry?.actions.some((a) => a.recovered);
        const playback = videoPath && videoCheck?.ok && s.videoStart != null ? `
      <p><a href="${escapeHtml(basename(videoPath))}#t=${s.videoStart}" data-time="${s.videoStart}" data-play="true">Play transition · ${time(s.videoStart)}</a>
      <a href="${escapeHtml(basename(videoPath))}#t=${Math.min(s.videoShot, videoCheck.duration - .02)}" data-time="${Math.min(s.videoShot, videoCheck.duration - .02)}">Pause at screen</a></p>` : '';
        return `
  <figure class="card" id="${basename(s.path)}">
    <figcaption><strong>${escapeHtml(s.title)}</strong> <span class="${failed ? 'failure' : ''}">${failed ? 'FAIL' : 'PASS'}</span>
      <p><a href="${escapeHtml(basename(s.path))}">Original PNG</a> · <a href="${escapeHtml(s.id)}.txt">Screen text</a></p>
      ${playback}
      ${recovered ? '<p class="failure">Navigation recovered after leaving the expected app surface. Inspect this step.</p>' : ''}
      ${s.snapshotOk === false || s.screenshotOk === false ? '<p class="failure">Screen evidence could not be captured completely.</p>' : ''}
      ${errors.length ? `<details><summary>Failed actions</summary><pre>${escapeHtml(errors.map((a) => `${a.kind} ${a.text ?? ''}: ${a.error ?? 'failed'}`).join('\n'))}</pre></details>` : ''}
    </figcaption>
    <img src="${escapeHtml(basename(s.path))}" alt="${escapeHtml(s.title)}" loading="lazy"/>
  </figure>`;
      },
    )
    .join('\n');

  const videoBlock = videoPath
    ? `<section class="video"><h2>Full-run video (stutters / motion)</h2>
       <video id="run-video" controls playsinline preload="metadata" src="${escapeHtml(basename(videoPath))}"></video>
       <p id="video-status" role="status">${videoCheck?.ok ? 'Video decoded; its final frame matches the final screenshot. Use Play transition on a screen below.' : escapeHtml(videoCheck?.error ?? 'Recording has not been validated.')}</p>
       <p><label>Playback speed <select id="playback-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label>
       ${videoCheck?.ok ? '<a href="chapters.vtt" download>Download chapters</a>' : ''}</p></section>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>RPM phone UX · ${escapeHtml(runId)}</title>
<style>
  :root { color-scheme: dark; --bg:#0e1116; --card:#171b22; --text:#e8eaed; --muted:#9aa0a6; --line:#2a3038; --link:oklch(83% .09 255); --error:oklch(82% .1 20); }
  * { box-sizing: border-box; }
  body { margin:0; font: 14px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--text); }
  header { padding:16px 20px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 4px; font-size:18px; }
  p { margin:0; color:var(--muted); }
  .video { padding:16px 20px; border-bottom:1px solid var(--line); }
  video { inline-size:auto; max-inline-size:min(420px, 100%); max-block-size:65svh; border-radius:12px; background:#000; }
  main { display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap:16px; padding:16px 20px 40px; }
  .card { margin:0; min-inline-size:0; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:clip; }
  figcaption { padding:10px 12px; border-bottom:1px solid var(--line); }
  figcaption code { color:var(--muted); font-size:11px; }
  img { display:block; width:100%; height:auto; background:#000; }
  a { color:var(--link); text-underline-offset:.2em; display:inline-block; padding-block:.5rem; }
  a + a { margin-inline-start:.75rem; }
  a:active { opacity:.7; }
  select { min-block-size:44px; font:inherit; }
  :focus-visible { outline:2px solid var(--link); outline-offset:3px; }
  .failure { color:var(--error); }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; }
  @media (hover:hover) and (pointer:fine) { a:hover { text-decoration-thickness:2px; } }
</style>
</head>
<body>
<header>
  <h1>RPM Glass phone UX · ${escapeHtml(runId)}</h1>
  <p>${shots.length} stills${videoPath ? ' + full-run video' : ''}. Comment per shot.</p>
  ${result ? `<p class="${result.ok ? '' : 'failure'}">${result.ok ? 'PASS' : 'FAIL'} · ${result.completedSteps}/${result.expectedSteps} screens captured${result.runError ? ` · ${escapeHtml(result.runError)}` : ''}. <a href="manifest.json">Full results and timings</a></p>` : ''}
  ${videoCheck?.ok === false ? `<p class="failure">${escapeHtml(videoCheck.error)}</p>` : ''}
</header>
${videoBlock}
<main>${cards}</main>
<script>
const video = document.getElementById('run-video');
video?.addEventListener('error', () => {
  document.getElementById('video-status').textContent = 'This browser cannot play the recording. Open the MP4 in a video player.';
});
document.querySelectorAll('[data-time]').forEach(link => link.addEventListener('click', async event => {
  if (!video || video.error) return;
  event.preventDefault();
  video.pause();
  if (video.readyState < 1) await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, {once:true}));
  video.currentTime = Number(link.dataset.time);
  video.scrollIntoView({block:'center'});
  if (link.dataset.play) video.play().catch(() => {
    document.getElementById('video-status').textContent = 'Playback failed. Open the MP4 directly to inspect it.';
  });
}));
document.getElementById('playback-speed')?.addEventListener('change', event => {
  video.playbackRate = Number(event.target.value);
});
</script>
</body>
</html>`;

  const galleryPath = `${outDir}/gallery.html`;
  writeFileSync(galleryPath, html);
  return galleryPath;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
