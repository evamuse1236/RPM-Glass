const ICON = {add: 'add_circle', complete: 'check_circle', reopen: 'radio_button_unchecked', change: 'edit', remove: 'delete', move: 'drive_file_move', order: 'format_list_numbered'};
const VERB = {add: 'Added', complete: 'Done', reopen: 'Reopened', change: 'Changed', remove: 'Moved to Trash', move: 'Moved', order: 'Reordered'};
const NOUN = {task: '', block: 'Block', project: 'Project', goal: 'Goal', area: 'Area'};

function when(fields, timeZone) {
  if (fields?.start) {
    const date = new Date(fields.start);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('en-GB', {timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true}).format(date).replace(/\b(am|pm)\b/i, m => m.toUpperCase());
  }
  if (fields?.day && /^\d{4}-\d{2}-\d{2}$/.test(fields.day)) return new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short'}).format(new Date(`${fields.day}T00:00:00Z`));
  if (fields && 'start' in fields && fields.start === null) return 'Time not set';
  return null;
}

/** One voice change as a row: a Material Symbols icon, a lead word, the title and an optional detail line. */
export function voiceRow(change, timeZone) {
  const fields = change.fields ?? {};
  const details = [];
  if (change.kind === 'move' && change.to) details.push(`to ${change.to}`);
  const time = when(fields, timeZone);
  if (time) details.push(time);
  if (fields.alert && fields.alert !== 'off' && Number.isInteger(fields.alertLead)) details.push(`${fields.alert === 'alarm' ? 'Alarm' : 'Reminder'} ${fields.alertLead} min before`);
  else if (fields.alert === 'off') details.push('Alert off');
  if (fields.repeat) details.push(`Repeats ${fields.repeat}`);
  if (fields.must === true) details.push('Must');
  const noun = NOUN[change.entity] ?? '';
  return {icon: ICON[change.kind] ?? 'edit', verb: noun ? `${VERB[change.kind] ?? 'Changed'} ${noun}` : VERB[change.kind] ?? 'Changed',
    title: change.title ?? '', detail: details.join(' · ')};
}

/** The receipt's count line, e.g. "5 changes saved". */
export function voiceCount(changes) {
  const n = changes.length;
  return n ? `${n} change${n === 1 ? '' : 's'} saved` : 'Nothing changed';
}
