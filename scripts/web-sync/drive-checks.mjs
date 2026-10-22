import {sleep} from './cdp.mjs';
import {makeKit} from './drive-kit.mjs';
import {today, todayGestures} from './drive-today.mjs';
import {startNow, tasks} from './drive-tasks.mjs';
import {blocks} from './drive-blocks.mjs';
import {projectsLife} from './drive-projects-life.mjs';
import {review} from './drive-review.mjs';
import {habitsSettings} from './drive-habits-settings.mjs';

const AREAS = {
  today: [today, startNow, todayGestures],
  tasks: [startNow, tasks],
  blocks: [blocks],
  'projects-life': [projectsLife],
  review: [review],
  'habits-settings': [habitsSettings],
};
const ORDER = [today, startNow, todayGestures, tasks, blocks, projectsLife, review, habitsSettings];

export async function runChecks({b, check, state, site, only}) {
  if (only && !AREAS[only]) throw new Error(`--only takes one of: ${Object.keys(AREAS).join(', ')}`);
  const k = makeKit({b, check, state, site});
  for (const area of only ? AREAS[only] : ORDER) {
    await b.viewport(412, 915);
    await area(k);
    await k.closeAll();
    await sleep(300);
  }
}
