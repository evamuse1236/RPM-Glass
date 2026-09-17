/** Copy the kit under intent-v2/ in the repo. Call from the bundled runtime.
 * Example wiring, not an automatically installed replacement of runtime.mjs.
 */
import {IntentHarness} from '../src/harness.mjs';
import {createRepository,nativeBackend} from '../src/repository.mjs';
import {createRpmPlanAdapter} from './rpm-glass.mjs';
import {nativeModelTransport} from './transport.mjs';
export function bootstrap({native,changePlanner,undo,prompt,model,onEvent}){
 const repository=createRepository(nativeBackend(native));
 const adapter=createRpmPlanAdapter({changePlanner,undo,readCalendar:anchor=>native('calendarRead',{anchor})});
 return new IntentHarness({repository,...adapter,model:nativeModelTransport({native,model,prompt}),onEvent,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
}
// Inject changePlanner from android-companion/planner-tools.mjs and undo from
// chat-prototype/companion-tools.mjs. Rebuild the bundled runtime, not just assets.
// Pilot commits must serialize with the legacy runtime or reload its data after
// every pilot write. Keeping the old closure's stale version will produce conflicts.
