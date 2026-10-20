// Copy of NotchAnchor and NotchGeometry: the phone runs the Java, so change both together (notch-scene.test.mjs checks the numbers match).
import {S24} from './device.mjs';

export const D = S24.density;
export const dp = v => Math.round(v * D);
export const css = px => `${px / D}px`;
export const ISLAND_INSET_DP = 12;

/** Section 0 of docs/notch-redesign-plan.md, in dp: one 36dp corner, a 16dp margin on all four sides, inner corners 36 less their inset. */
export const G = Object.freeze({
  RADIUS_DP: 36, PAD_DP: 16, CIRCLE_DP: 40, CONTROL_DP: 40, TOUCH_DP: 48, ROW_DP: 44, ROW_OUTSET_DP: 8, BAND_GAP_DP: 12,
  CONTROLS_GAP_DP: 16, ROWS_GAP_DP: 12, PAIR_GAP_DP: 8, PILL_RING_DP: 28, PILL_RING_INSET_DP: 4, MIN_PILL_WIDTH_DP: 112,
  VALUE_START_DP: 8, VALUE_END_DP: 14, VALUE_CAP_DP: 12, CHIP_DP: 16, PILL_VALUE_SP: 15, BAND_VALUE_SP: 22, ALERT_TIME_SP: 17,
  MAX_HEIGHT_SHARE: 0.6, SHORT_TITLE_LINES: 2,
});
export const innerRadius = inset => G.RADIUS_DP - inset;

/** NotchGeometry.fits: the open island drops rows 3, 2, 1, then any face cuts its title to two lines; nothing is ever cut off. */
export function fits(open) {
  const out = [];
  for (let rows = 3; rows >= (open ? 1 : 3); rows--) out.push({rows, shortTitle: false});
  out.push({rows: open ? 1 : 3, shortTitle: true});
  return out;
}
export const faceTop = () => G.PAD_DP + G.CIRCLE_DP + G.BAND_GAP_DP;

export function anchor(device = S24) {
  const {left, top, right, bottom} = device.cutout;
  const hole = Math.min(right - left, bottom - top);
  const pillTop = Math.max(dp(2), bottom - hole - dp(4));
  const pillBottom = device.statusBarPx > 0 ? Math.max(device.statusBarPx, bottom) : bottom + dp(4);
  const pill = pillBottom - pillTop;
  return {centerX: Math.floor((left + right) / 2), centerY: pillTop + Math.floor(pill / 2), hole, pill, top: pillTop, bottom: pillBottom};
}

/** The pill's ring in dp: 28, or smaller on a short pill so its inset keeps it concentric with the pill's ends. */
export const pillRing = pillDp => Math.min(G.PILL_RING_DP, pillDp - 2 * G.PILL_RING_INSET_DP);

/** Where the ring and the value sit, in dp of the stage, for the pill ({x, w, h}) or an island ({x, w}); top is the pill's top. */
export function bandAt(mode, geo, top) {
  if (mode === 'pill') {
    const d = pillRing(geo.h);
    return {cx: geo.x + geo.h / 2, cy: top + geo.h / 2, d, valueRight: geo.x + geo.w - G.VALUE_END_DP};
  }
  const r = G.CIRCLE_DP / 2;
  return {cx: geo.x + G.PAD_DP + r, cy: top + G.PAD_DP + r, d: G.CIRCLE_DP, valueRight: geo.x + geo.w - G.PAD_DP};
}
