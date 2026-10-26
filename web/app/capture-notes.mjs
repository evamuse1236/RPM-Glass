export const RECENT = 3600000;
export const DISMISSED_MAX = 100;
const DISMISSED_KEY = 'rpm.web.capture.dismissed.v1';

export function dismissedNotes(storage) {
  let ids = [];
  try {
    const saved = JSON.parse(storage?.getItem(DISMISSED_KEY) ?? '[]');
    if (Array.isArray(saved)) ids = saved.filter(id => typeof id === 'string').slice(-DISMISSED_MAX);
  } catch {}
  return {
    has: id => ids.includes(id),
    add(id) {
      ids = [...ids.filter(saved => saved !== id), id].slice(-DISMISSED_MAX);
      try { storage?.setItem(DISMISSED_KEY, JSON.stringify(ids)); } catch {}
    },
  };
}

const quote = text => `“${text.trim().slice(0, 80)}”`;
const SORTING = 'Sorting your words';
const KEPT = 'Your words were kept. Send again to retry.';
const FAILED = new Set(['rejected', 'conflict']);

/** What the server made of one Capture: its question, its receipt, or that it is still sorting. */
export function captureOutcome(capture) {
  const receipt = (capture?.receipt ?? []).map(line => line.text).filter(Boolean);
  const question = typeof capture?.question === 'string' ? capture.question : capture?.question?.text;
  if (capture?.status === 'needs-answer' && question) return [question];
  if (capture?.status === 'words-kept') return [KEPT];
  if (receipt.length) return receipt;
  return !capture || capture.status === 'saved' || capture.status === 'sorting' ? [SORTING] : [];
}

export function captureNotes({outbox, captures = [], dismissed, now = Date.now()}) {
  const notes = [];
  for (const entry of outbox) {
    const {id, type, args, createdAt} = entry.command;
    if (type !== 'capture' || dismissed.has(id)) continue;
    const text = quote(args.text);
    if (FAILED.has(entry.status)) {
      notes.push({id, icon: 'error', tone: 'problem', text: entry.message || 'This capture was not saved.', lines: [], dismissible: true});
      continue;
    }
    if (entry.status === 'sending') {
      notes.push({id, icon: 'schedule', tone: 'waiting', text, lines: ['Saving']});
      continue;
    }
    const capture = captures.find(c => c.id === id);
    const recent = now - Date.parse(createdAt) < RECENT;
    if (!capture && !recent) continue;
    const lines = captureOutcome(capture);
    if (capture?.status === 'needs-answer') notes.push({id, icon: 'help', tone: 'waiting', text, lines, dismissible: true});
    else if (capture?.status === 'words-kept') notes.push({id, icon: 'error', tone: 'problem', text, lines, dismissible: true});
    else if (capture?.status === 'applied' || (capture && lines.length && lines[0] !== SORTING)) {
      if (recent) notes.push({id, icon: 'check_circle', tone: 'done', text, lines: lines.length ? lines : ['Saved'], dismissible: true});
    } else notes.push({id, icon: 'schedule', tone: 'waiting', text, lines: [SORTING]});
  }
  return notes;
}
