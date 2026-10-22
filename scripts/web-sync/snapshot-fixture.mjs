// Synthetic contract fixture, from the same anchored seed as rpmctl and web-sync tests.
import {writeFileSync} from 'node:fs';
import {seedStore} from '../gauntlet/seed.mjs';
import {buildSnapshot} from '../../android-companion/web-sync-snapshot.mjs';
process.env.TZ = 'Asia/Kolkata';
const snapshot = buildSnapshot(seedStore(new Date('2026-10-19T12:00:00+05:30')).data);
snapshot.revision = 42;
snapshot.savedAt = '2026-10-19T06:30:00.000Z';
writeFileSync(new URL('../../web/fixtures/snapshot.json', import.meta.url), JSON.stringify(snapshot) + '\n');
