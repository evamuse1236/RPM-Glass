export const RECENT = 3600000;

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
