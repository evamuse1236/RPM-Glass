import fixture from '../fixtures/snapshot.json' with {type: 'json'};
import {createMockPhone} from './sync/mock.mjs';
import {SCENARIOS} from './sync/mock-scenarios.mjs';
import {createHttpTransport, hasHttpSettings, KEYS} from './sync/http.mjs';
import {createStore} from './sync/store.mjs';
import {mountApp} from './ui/app.mjs';

const params = new URLSearchParams(location.search);
const scenario = SCENARIOS.includes(params.get('state')) ? params.get('state') : null;
const pinned = params.get('now') ? Date.parse(params.get('now')) : null;
const started = Date.now();
const now = () => new Date(pinned ? pinned + (Date.now() - started) : Date.now());

const storage = window.localStorage;
if (params.get('api')) storage.setItem(KEYS.base, params.get('api'));
const live = !scenario && (hasHttpSettings(storage) || params.has('api'));

const transport = live ? createHttpTransport({storage}) : createMockPhone({fixture, scenario, now});
const store = createStore({transport, now, storage: live ? storage : null});
const app = mountApp(document.getElementById('app'), {store, now, demo: !live, storage});
if (live) {
  addEventListener('online', () => store.setOnline(true));
  addEventListener('offline', () => store.setOnline(false));
  if (!navigator.onLine) store.setOnline(false);
}
store.start();
window.rpm = {store, app};
