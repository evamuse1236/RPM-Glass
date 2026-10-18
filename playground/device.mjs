// Measured on the user's Galaxy S24 FE (adb, 2026-10-18): cutout rect [506,24][574,92], status bar inset 92 px.
const density = 450 / 160;

export const S24 = Object.freeze({
  name: 'Galaxy S24 FE',
  width: 1080,
  height: 2340,
  density,
  hole: Object.freeze({centerX: 540, centerY: 58, diameter: 68}),
  cutout: Object.freeze({left: 506, top: 24, right: 574, bottom: 92}),
  statusBarPx: 92,
  statusBarDp: 92 / density,
  navBarDp: 16,
});
