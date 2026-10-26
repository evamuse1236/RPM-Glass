export const ON_PHONE = 'This runs on your phone. Open RPM on your phone to use it.';
export const PHONE_SETTINGS = 'Sounds, alerts, widgets, the notch, model keys, backups and diagnostics are set in RPM on your phone.';
export const PHONE = Object.freeze({remote: true, hasKey: false, debug: false, fontScale: 1, effectiveFontScale: 1, reducedMotion: false});

const refuse = () => Promise.reject(new Error(ON_PHONE));

/** The planner's native bridge in a browser: phone-only features say so, and Capture opens the Site's own sheet. */
export function createWebNative({openCapture}) {
  const answers = {
    haptic: () => undefined,
    keyboard: () => undefined,
    surface: () => undefined,
    calendarRead: () => ({status: 'not_selected', events: []}),
    calendarList: () => ({permitted: false, calendars: [], selected: []}),
    appSettings: () => ({phoneOnly: PHONE_SETTINGS}),
    settingsAction: () => ({phoneOnly: PHONE_SETTINGS}),
    capture: () => { openCapture(); },
  };
  return (name, args) => name in answers ? Promise.resolve(answers[name](args)) : refuse();
}

export const sortPreview = {
  create: refuse,
  accept: refuse,
  dismiss: refuse,
  get: () => null,
  list: () => [],
};
