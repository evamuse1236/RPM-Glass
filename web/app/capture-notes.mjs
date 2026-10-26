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

export function captureNotes({outbox, captures = [], settled, dismissed, now = Date.now()}) {
  const notes = [];
  for (const entry of outbox) {
    const {id, type, args, createdAt} = entry.command;
    if (type !== 'capture' || dismissed.has(id)) continue;
    if (!settled(entry)) {
      notes.push({id, icon: 'schedule', tone: 'waiting', text: `Capture ${quote(args.text)} is waiting for your phone.`, lines: []});
    } else if (entry.status !== 'applied') {
      notes.push({id, icon: 'error', tone: 'problem', text: entry.message || 'Your phone did not save this capture.', lines: [], dismissible: true});
    } else if (now - Date.parse(createdAt) < RECENT) {
      const receipt = (captures.find(capture => capture.id === id)?.receipt ?? []).map(line => line.text).filter(Boolean);
      notes.push({id, icon: 'check_circle', tone: 'done', text: quote(args.text), lines: receipt.length ? receipt : [entry.message || 'Capture saved on the phone.'], dismissible: true});
    }
  }
  return notes;
}
