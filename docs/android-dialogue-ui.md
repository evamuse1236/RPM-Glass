# Android single-dialogue surface

User direction: show only the current assistant dialogue, headed by the blue dot and `rpm`. No visible conversation log, earlier-message control, user message bubbles, receipts, or supplementary status copy on the main surface. History remains in storage and available through the existing secondary destinations.

Sending fades out the current dialogue and clears the composer while preserving input focus. Cyan and violet blurred light drifts beneath the glass during the actual request; no waveform bars. The label becomes `Thinking`, then returns to `RPM` as the current answer fades in. No artificial response delay. Failures replace the dialogue and restore the draft. Reduced motion uses a static light field. Suggestion choices remain above the input. Tapping Send does not take typing focus; manually dismissing the keyboard remains possible.

The browser prototype is unchanged. Android uses the existing compactReply platform boundary. Build and 38 chat/gesture tests passed; physical-device motion performance is not measured.

Transition refinement: text softens out over 380 ms; the underlying light fades in with a 140 ms overlap. On completion, the light remains mounted for its 600 ms fade-out while the answer fades in over 550 ms after a 180 ms overlap. Repeated requests cancel the prior exit timer. No hide/show cut and no competing content-reveal animation. Reduced motion uses a short crossfade without blur or drifting light.
