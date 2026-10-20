/**
 * A finger dragged along the tab bar at `x` (px from the bar's start edge) over its tabs `slots` ([{left, width}]):
 * the tab under it, and where the pill sits, centred on the finger but never past the first or last tab's own place.
 */
export function navDrag(x, slots, pillWidth) {
  const found = slots.findIndex(slot => x < slot.left + slot.width);
  const index = found < 0 ? slots.length - 1 : found;
  const place = slot => slot.left + (slot.width - Math.min(pillWidth, slot.width)) / 2;
  const pillX = Math.min(place(slots.at(-1)), Math.max(place(slots[0]), x - pillWidth / 2));
  return {index, pillX};
}
