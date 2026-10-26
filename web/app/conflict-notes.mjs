const TEXT_FIELDS = ['title', 'raw', 'name', 'text', 'notes', 'purpose', 'leverage', 'evidence'];
const NAME_FIELDS = new Set(['title', 'raw', 'name', 'text']);
const LISTS = {task: 'tasks', block: 'blocks', project: 'projects', area: 'areas', goal: 'goals', draft: 'drafts', capture: 'captures'};
const SUBJECTS = {context: 'Your vision', week: 'This week', review: 'Your review', waterSettings: 'Water settings'};
const GROUP_WORDS = {alertIntent: 'alert', completion: 'done state', minutes: 'estimate', colorIndex: 'color', projectId: 'Project', goalId: 'Goal', areaId: 'Area'};

const words = camel => camel.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const quote = text => `“${String(text).trim().slice(0, 80)}”`;
const nameOf = record => record && typeof record === 'object' ? record.title ?? record.name ?? record.text ?? record.raw ?? null : null;

function itemName({kind, id}, conflict, snapshot) {
  const named = nameOf(conflict.kept) ?? nameOf(conflict.lost);
  if (conflict.group === 'record' && named) return quote(named);
  const lists = [snapshot?.[LISTS[kind]], snapshot?.entries].filter(Array.isArray);
  for (const list of lists) {
    const found = nameOf(list.find(record => String(record?.id) === id && (!record.kind || record.kind === kind)));
    if (found) return quote(found);
  }
  if (SUBJECTS[kind]) return SUBJECTS[kind];
  return kind ? `A ${words(kind)}` : 'An item';
}

function textChange(conflict) {
  for (const field of TEXT_FIELDS) {
    const kept = conflict.kept?.[field];
    const lost = conflict.lost?.[field];
    if (typeof kept === 'string' && typeof lost === 'string') return {field, kept, lost};
  }
  return null;
}

function sentence(conflict, snapshot) {
  const [kind, ...rest] = String(conflict.key ?? '').split(':');
  const item = {kind, id: rest.join(':')};
  const device = conflict.lostFrom === 'server' ? 'website' : 'phone';
  const text = textChange(conflict);
  if (text) {
    const tail = `changed on two devices. Kept ${quote(text.kept)}. Other version from your ${device}: ${quote(text.lost)}.`;
    return NAME_FIELDS.has(text.field) ? `${tail[0].toUpperCase()}${tail.slice(1)}` : `${itemName(item, conflict, snapshot)} ${words(text.field)} ${tail}`;
  }
  const name = itemName(item, conflict, snapshot);
  if (conflict.group === 'record') return conflict.kept == null ? `${name} was deleted on one device and changed on the other. It stays deleted.` : `${name} changed on two devices. Kept the newer change.`;
  return `${name} ${GROUP_WORDS[conflict.group] ?? words(String(conflict.group ?? 'details'))} changed on two devices. Kept the newer change.`;
}

/** One dismissible note per change that lost to a newer one on another device. */
export function conflictNotes({conflicts, snapshot, dismissed}) {
  return (Array.isArray(conflicts) ? conflicts : []).map(conflict => ({
    id: `conflict:${conflict.id ?? `${conflict.key}|${conflict.group}|${conflict.at}`}`,
    icon: 'call_split', tone: 'waiting', text: sentence(conflict, snapshot), lines: [], dismissible: true,
  })).filter(note => !dismissed.has(note.id));
}
