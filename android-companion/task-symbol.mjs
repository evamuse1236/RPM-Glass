/** The icon in a task's pill and chip, picked from the words of its title; the first matching row wins. */
export const SYMBOLS = Object.freeze([
  ['groups', ['group', 'meet', 'meeting', 'sync', 'interview', 'team']],
  ['call', ['call', 'phone', 'ring']],
  ['school', ['study', 'revise', 'revision', 'exam', 'quiz', 'paper', 'lecture', 'class', 'lab', 'homework', 'assignment']],
  ['edit_note', ['write', 'draft', 'essay', 'notes', 'section', 'edit']],
  ['menu_book', ['read', 'book', 'pages', 'chapter']],
  ['checklist', ['review', 'check', 'plan', 'sort']],
  ['directions_run', ['gym', 'run', 'walk', 'workout', 'yoga', 'exercise', 'swim', 'stretch']],
  ['mail', ['email', 'mail', 'reply', 'message', 'text']],
  ['redeem', ['birthday', 'gift', 'card', 'present']],
  ['payments', ['pay', 'bank', 'bill', 'fee', 'refund', 'rent']],
  ['shopping_bag', ['buy', 'shop', 'shopping', 'groceries', 'order']],
  ['medical_services', ['doctor', 'dentist', 'medicine', 'pharmacy', 'hospital', 'clinic']],
  ['cleaning_services', ['clean', 'laundry', 'wash', 'tidy']],
  ['skillet', ['cook', 'bake']],
  ['code', ['code', 'bug', 'deploy', 'build']],
]);
export const TASK_SYMBOL = 'task_alt';
const ROUTINE_SYMBOLS = Object.freeze([['wb_sunny', ['morning']], ['bedtime', ['evening', 'night', 'bed']]]);
export const ROUTINE_SYMBOL = 'self_improvement';

const words = title => String(title ?? '').toLowerCase().match(/\p{L}+/gu) ?? [];
const pick = (table, title, fallback) => {
  const said = new Set(words(title));
  return table.find(([, keys]) => keys.some(key => said.has(key)))?.[0] ?? fallback;
};

export const taskSymbol = title => pick(SYMBOLS, title, TASK_SYMBOL);
export const routineSymbol = name => pick(ROUTINE_SYMBOLS, name, ROUTINE_SYMBOL);
