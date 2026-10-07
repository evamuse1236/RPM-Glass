import {sleep} from './lib.mjs';

export const id = 'capture-keeps-words';
export const rule = "Capture saves the user's exact words before anything else, even with no AI key: the stored raw text equals what was typed, the screen says the words are saved, and nothing claims they were sorted.";
export const enforces = 'Product rule "Preserve the user\'s original words" (AGENTS.md, PRODUCT.md); corrections in bc8e759 ("keep every thought"), 534194f, cea2137 ("notes never vanish").';

const WORDS = 'Call Amma about Sunday’s puja, maybe 6 pm? Also buy marigolds';

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  await t.do('open', 'widget-capture');
  await t.do('tap', '--role', 'textbox', '--name', 'Capture a thought');
  await t.do('type', WORDS);
  await t.shot('typed');
  await t.do('tap', '--role', 'button', '--name', 'Send');
  await t.do('wait', '--name', 'Your words are saved', '--timeout', '15000');
  await sleep(1500);
  await t.shot('saved');
  const screen = await t.read(() => document.getElementById('content')?.innerText ?? '');
  const captures = Object.values((await t.store()).intentV2?.captures ?? {});
  const mine = captures.filter(c => c.raw === WORDS);
  Object.assign(t.facts, {captures: captures.map(c => ({raw: c.raw, status: c.status}))});
  t.expect(mine.length === 1, `Expected one capture whose raw text is exactly the typed words; found ${mine.length}`, t.facts.captures);
  t.expect(/Connect an AI key|Your words stay saved/.test(screen), 'Without a key the screen should say the words are kept and offer to connect a key', screen.slice(0, 400));
  t.expect(!/tasks? added/i.test(screen), 'Nothing should claim tasks were added without a model', screen.slice(0, 400));
}
