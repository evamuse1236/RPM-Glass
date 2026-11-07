/**
 * USB-phone UX tour for RPM Glass.
 * Profiles: `fast` (core surfaces, short settles) and `full` (detail sheets + secondary menus).
 */

export const PACKAGE = 'com.rpm.prototype';

/**
 * @typedef {{
 *   kind: 'open' | 'click' | 'back' | 'wait' | 'pause' | 'ensure' | 'dismissKeyboard' | 'home' | 'longpress' | 'anyClick',
 *   text?: string,
 *   texts?: string[],
 *   role?: string,
 *   ms?: number,
 *   soft?: boolean,
 *   optional?: boolean,
 * }} Action
 * @typedef {{
 *   id: string,
 *   title: string,
 *   expect?: string,
 *   expects?: string[],
 *   selected?: string,
 *   profile?: 'fast' | 'full',
 *   optional?: boolean,
 *   actions: Action[],
 * }} Step
 */

const settle = {
  fast: { short: 180, mid: 280, sheet: 350, open: 500 },
  full: { short: 250, mid: 400, sheet: 550, open: 700 },
};

/** Build the tour for a profile. Pause lengths come from the profile. */
export function buildTour(profile = 'fast') {
  const p = settle[profile] || settle.fast;
  /** @type {Step[]} */
  const steps = [
    {
      id: '01-capture-launch',
      title: 'Capture launch',
      expect: 'Capture a thought',
      actions: [{ kind: 'open' }, { kind: 'pause', ms: p.open }],
    },
    {
      id: '02-capture-more',
      title: 'Capture More sheet',
      expect: 'Planner',
      actions: [
        { kind: 'dismissKeyboard' },
        { kind: 'ensure' },
        { kind: 'click', text: 'More', role: 'button', soft: false },
        { kind: 'pause', ms: p.mid },
      ],
    },
    {
      id: '03-today',
      title: 'Today',
      expect: 'Today',
      actions: [
        { kind: 'click', text: 'Planner', role: 'button', soft: false },
        { kind: 'wait', text: 'Today' },
        { kind: 'click', text: 'Today', role: 'button', soft: true },
        { kind: 'pause', ms: p.mid },
      ],
    },
    {
      id: '04-add-task',
      title: 'Quick add',
      expect: 'This weekend',
      actions: [
        { kind: 'click', text: 'Add task', role: 'button' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '05-today',
      title: 'Today (after add)',
      expect: 'Today',
      actions: [
        { kind: 'dismissKeyboard' },
        { kind: 'back' },
        { kind: 'ensure' },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '06-task-sheet',
      title: 'Task sheet',
      expect: 'task-panel-when',
      profile: 'full',
      actions: [
        // First openable task row on Today (substring match).
        { kind: 'click', text: 'Open task', soft: true },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '06a-task-alert',
      title: 'Task sheet · Alert',
      expect: 'task-panel-alert',
      expects: ['task-panel-alert', 'Reminder', 'Ringing alarm', 'No alert', 'Alert'],
      profile: 'full',
      actions: [
        { kind: 'click', text: 'Alert,', role: 'group', soft: false },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '06a2-alert-reminder',
      title: 'Alert · Reminder chip',
      expect: 'Reminder',
      expects: ['Reminder', 'Remind', 'Alert'],
      profile: 'full',
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Reminder', 'Remind'], soft: true, optional: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '06a3-alert-alarm',
      title: 'Alert · Ringing alarm chip',
      expect: 'Ringing alarm',
      expects: ['Ringing alarm', 'Alarm', 'Alert'],
      profile: 'full',
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Ringing alarm', 'Alarm'], soft: true, optional: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '06a4-alert-off',
      title: 'Alert · restore Off',
      expect: 'Alert',
      expects: ['No alert', 'Off', 'Alert'],
      profile: 'full',
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['No alert', 'Off'], soft: true, optional: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '06b-task-repeat',
      title: 'Task sheet · Repeat',
      expect: 'task-panel-repeat',
      profile: 'full',
      actions: [
        { kind: 'click', text: 'Repeat,', role: 'group', soft: false },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '06c-task-block',
      title: 'Task sheet · Block',
      expect: 'task-panel-block',
      profile: 'full',
      actions: [
        { kind: 'click', text: 'Block,', role: 'group', soft: false },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '07-today-after-task',
      title: 'Today (after task sheet)',
      expect: 'Today',
      profile: 'full',
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '08-habits',
      title: 'Habits',
      expect: 'Habits',
      actions: [
        { kind: 'click', text: 'Today', role: 'button', soft: true },
        { kind: 'click', text: 'More options', role: 'button' },
        { kind: 'pause', ms: p.short },
        { kind: 'click', text: 'Habits' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '09-today-after-habits',
      title: 'Today (after Habits)',
      expect: 'Today',
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '09a-water-log',
      title: 'Water log (habit circle)',
      expect: 'Glass logged',
      expects: ['Glass logged', 'of', 'Undo', 'Water'],
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Water,', 'Log a glass', 'of'], soft: true, optional: true },
        { kind: 'pause', ms: p.mid },
      ],
    },
    {
      id: '09b-water-undo',
      title: 'Water Undo (restore)',
      expect: 'Today',
      expects: ['Today', 'Undo', 'Change undone', 'Water'],
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Undo'], soft: true, optional: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '09c-meal-log',
      title: 'Meal log sheet',
      expect: 'Log a meal',
      expects: ['Log a meal', 'Log lunch', 'Log dinner', 'Log breakfast', 'Not logged', 'Breakfast', 'Lunch', 'Dinner'],
      optional: true,
      actions: [
        {
          kind: 'anyClick',
          texts: ['Log lunch', 'Log dinner', 'Log breakfast', 'not logged', 'Lunch not logged', 'Dinner not logged', 'Breakfast not logged'],
          soft: true,
          optional: true,
        },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '09d-today-after-meal',
      title: 'Today (after meal sheet)',
      expect: 'Today',
      optional: true,
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '09e-task-done',
      title: 'Task Done (tick)',
      expect: 'completed',
      expects: ['completed', 'Undo', 'done', 'Task completed'],
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Mark ', 'complete'], soft: true, optional: true },
        { kind: 'pause', ms: p.mid },
      ],
    },
    {
      id: '09f-task-done-undo',
      title: 'Task Done Undo (restore)',
      expect: 'Today',
      expects: ['Today', 'Undo', 'Change undone'],
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Undo'], soft: true, optional: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '10-blocks',
      title: 'Blocks',
      expect: 'Blocks',
      actions: [{ kind: 'click', text: 'Blocks', role: 'button' }, { kind: 'pause', ms: p.mid }],
    },
    {
      id: '11-block-detail',
      title: 'Block detail',
      expect: 'Purpose',
      profile: 'full',
      actions: [
        { kind: 'click', text: 'Open Block', soft: true },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '12-blocks-after-detail',
      title: 'Blocks (after detail)',
      expect: 'Blocks',
      profile: 'full',
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '13-inbox',
      title: 'Inbox',
      expect: 'Inbox',
      actions: [{ kind: 'click', text: 'Inbox' }, { kind: 'pause', ms: p.sheet }],
    },
    {
      id: '14-blocks-after-inbox',
      title: 'Blocks (after Inbox)',
      expect: 'Blocks',
      actions: [{ kind: 'back' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '15-projects',
      title: 'Projects',
      expect: 'Projects',
      actions: [{ kind: 'click', text: 'Projects', role: 'button' }, { kind: 'pause', ms: p.mid }],
    },
    {
      id: '16-life',
      title: 'Life / Wheel',
      expect: 'Wheel of Life',
      actions: [{ kind: 'click', text: 'Life', role: 'button' }, { kind: 'pause', ms: p.mid }],
    },
    {
      id: '17-life-quarter',
      title: 'Life · Quarter',
      expect: 'Quarter',
      selected: 'Quarter',
      profile: 'full',
      actions: [{ kind: 'click', text: 'Quarter' }, { kind: 'pause', ms: p.mid }],
    },
    {
      id: '18-life-vision',
      title: 'Life · Vision',
      expect: 'Vision',
      selected: 'Vision',
      profile: 'full',
      actions: [{ kind: 'click', text: 'Vision' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '19-rate-areas',
      title: 'Rate your Areas',
      expect: 'Rate',
      profile: 'full',
      actions: [
        { kind: 'click', text: 'Rate your Areas', soft: true },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '20-life-after-rate',
      title: 'Life (after Rate)',
      expect: 'Life',
      profile: 'full',
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '21-search',
      title: 'Search',
      expect: 'Search',
      actions: [{ kind: 'click', text: 'Search', role: 'button' }, { kind: 'pause', ms: p.sheet }],
    },
    {
      id: '22-after-search',
      title: 'After Search',
      expect: 'Life',
      actions: [
        { kind: 'dismissKeyboard' },
        { kind: 'back' },
        { kind: 'ensure' },
        { kind: 'click', text: 'Life', role: 'button', soft: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '23-settings',
      title: 'Settings',
      expect: 'Settings',
      actions: [
        { kind: 'click', text: 'More options', role: 'button' },
        { kind: 'pause', ms: p.short },
        { kind: 'click', text: 'Settings' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '23a-settings-sounds',
      title: 'Settings · Sounds & alerts',
      expect: 'Alarm sound',
      expects: ['Alarm sound', 'Reminder sound', 'Notifications', 'Exact alarms', 'Sounds', 'Preview alarm', 'Check saved alerts'],
      optional: true,
      // Stay on Settings — do not open the system sound picker.
      actions: [{ kind: 'pause', ms: p.mid }],
    },
    {
      id: '23b-alarm-preview',
      title: 'Settings · Preview alarm sound',
      expect: 'Preview',
      expects: ['Preview alarm', 'Playing', 'Stop alarm', 'Alarm sound', 'Settings'],
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Preview alarm sound', 'Preview alarm'], soft: true, optional: true },
        { kind: 'pause', ms: p.mid },
        { kind: 'anyClick', texts: ['Stop alarm preview', 'Stop alarm'], soft: true, optional: true },
      ],
    },
    {
      id: '23c-settings-notch',
      title: 'Settings · Notch',
      expect: 'Notch',
      expects: ['Notch', 'RPM Notch', 'Settings'],
      optional: true,
      actions: [
        { kind: 'anyClick', texts: ['Notch'], soft: true, optional: true },
        { kind: 'pause', ms: p.mid },
      ],
    },
    {
      id: '24-after-settings',
      title: 'After Settings',
      expect: 'Life',
      actions: [
        { kind: 'back' },
        { kind: 'ensure' },
        { kind: 'back' },
        { kind: 'ensure' },
        { kind: 'click', text: 'Life', role: 'button', soft: true },
        { kind: 'pause', ms: p.short },
      ],
    },
    {
      id: '25-weekly-review',
      title: 'Weekly review',
      expect: 'Weekly review',
      actions: [
        { kind: 'click', text: 'More options', role: 'button' },
        { kind: 'pause', ms: p.short },
        { kind: 'click', text: 'Weekly review' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '26-after-review',
      title: 'After Weekly review',
      expect: 'Life',
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '27-trash',
      title: 'Trash',
      expect: 'Trash',
      profile: 'full',
      actions: [
        { kind: 'click', text: 'More options', role: 'button' },
        { kind: 'pause', ms: p.short },
        { kind: 'click', text: 'Trash' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '28-after-trash',
      title: 'After Trash',
      expect: 'Life',
      profile: 'full',
      actions: [{ kind: 'back' }, { kind: 'ensure' }, { kind: 'pause', ms: p.short }],
    },
    {
      id: '29-capture',
      title: 'Capture from planner',
      expect: 'Capture a thought',
      actions: [
        { kind: 'click', text: 'Search', role: 'button' },
        { kind: 'pause', ms: p.sheet },
        { kind: 'dismissKeyboard' },
        { kind: 'click', text: 'Say or type what is on your mind' },
        { kind: 'pause', ms: p.sheet },
        { kind: 'dismissKeyboard' },
      ],
    },
    {
      id: '30-capture-history',
      title: 'Capture History',
      expect: 'History',
      actions: [
        { kind: 'dismissKeyboard' },
        { kind: 'click', text: 'More', role: 'button' },
        { kind: 'pause', ms: p.short },
        { kind: 'click', text: 'History', role: 'button' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
    {
      id: '31-capture-context',
      title: 'Capture Context',
      expect: 'Context',
      actions: [
        { kind: 'back' },
        { kind: 'ensure' },
        { kind: 'dismissKeyboard' },
        { kind: 'click', text: 'More', role: 'button' },
        { kind: 'pause', ms: p.short },
        { kind: 'click', text: 'Context', role: 'button' },
        { kind: 'pause', ms: p.sheet },
      ],
    },
  ];

  // No profile → both. profile:'full' → full only. profile:'fast' → fast only.
  return steps.filter((s) => !s.profile || s.profile === profile);
}

/** @deprecated use buildTour — kept for dry-run compatibility */
export const TOUR = buildTour('fast');
