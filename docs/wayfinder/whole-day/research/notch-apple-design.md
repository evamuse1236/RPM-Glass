# Apple Dynamic Island design rules (scout, 2026-10-18)

Apple's HIG pages didn't load; most quotes come from WWDC23 "Design dynamic Live Activities" (https://developer.apple.com/videos/play/wwdc2023/10194/) and 2022 write-ups quoting the HIG. Check quotes before they go in a spec.

- **States:** compact (leading + trailing content hugging the sensor, "as narrow as possible"), minimal (when several run; "avoid reverting to purely just a logo"), expanded (press in; "get to the essence", no "forehead" above the sensor). Secondary sizes (Infinum): expanded max 144 pt tall, compact 36 px.
- **Two at once:** one goes minimal (circle); for many, "consider ticking between" them.
- **Colour:** colour conveys identity; liberal colour allowed in expanded. A black-background rule was not found (the hardware sensor is black, so the island reads black).
- **Alerting:** "rather than sending a push notification, when possible, expand the island"; alert only when essential.
- **Motion:** "a living organism, with a deliberate elasticity"; animate sparingly, only for real updates. No spring values found.
- **Interaction:** tap opens the app; press-and-hold expands with essential controls only.
- **Don'ts:** no ads, no sensitive info, don't point UI at the island, don't poke content into corners, update only when content changes, activities should have a clear start and end.
- **Examples (secondary, unverified):** Spotify/Apple Music, Timer, Uber Eats, DoorDash.
