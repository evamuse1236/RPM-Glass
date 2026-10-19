# The look to copy (user, 2026-10-18: "copy the ui and look design ... ours is still quite bad")

Reference screenshots: `notch-ref/` (Atoll: media.png, dynamicisland-minimalistic.png; SmartIsland: 04, 08). Copy the look; never the GPL code.

1. Pure black (#000), no border, no shadow. It reads as part of the screen, not a card on top.
2. The expanded panel grows out of the top edge: square top, large bottom radius (about 28-32 dp), and concave "ears" where it meets the top edge (Atoll).
3. One bold white primary line (title, ~15-16 sp semibold), one secondary line in an accent colour (Atoll tints it from the content; for us: task = soft white 60%, water = blue, meal = amber, agent = violet).
4. A thin progress bar with times on both ends (Atoll 0:14 / -3:43). For us: task elapsed / time left; water 5 of 8.
5. Large, bare icon controls in one centred row, no button backgrounds (Atoll's transport row). For us: Done, Snooze, Log meal, Ask agent.
6. Compact pill: a leading icon in a coloured circle on the left, a value on the right (SmartIsland: icon + "2"). A second activity becomes a separate black circle beside the pill (split island), not more text in it.
7. Expanded content leads with an image-sized square on the left (album art in Atoll). For us: the Area colour block or a big icon.
8. Our current expanded panel (grid of grey buttons + list) looks like a settings sheet. Replace with: one hero row (current task + bar + controls), then at most 3 small rows below.
