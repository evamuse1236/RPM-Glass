// Copy of NotchAnchor: the phone runs the Java, so change both together.
import {S24} from './device.mjs';

export const D = S24.density;
export const dp = v => Math.round(v * D);
export const css = px => `${px / D}px`;
export const ISLAND_INSET_DP = 12;

export function anchor(device = S24) {
  const {left, top, right, bottom} = device.cutout;
  const hole = Math.min(right - left, bottom - top);
  const pillTop = Math.max(dp(2), bottom - hole - dp(4));
  const pillBottom = device.statusBarPx > 0 ? Math.max(device.statusBarPx, bottom) : bottom + dp(4);
  const pill = pillBottom - pillTop;
  return {centerX: Math.floor((left + right) / 2), centerY: pillTop + Math.floor(pill / 2), hole, pill, top: pillTop, bottom: pillBottom};
}
