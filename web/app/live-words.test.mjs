import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveWords} from './live-words.mjs';

function fakeRecognition() {
  const made = [];
  class Recognition {
    constructor() { made.push(this); this.started = false; this.aborted = false; }
    start() { this.started = true; }
    abort() { this.aborted = true; }
    say(...texts) { this.onresult({results: texts.map(transcript => [{transcript}])}); }
  }
  return {Recognition, made};
}

test('words heard so far reach the panel, across the recognizer ending and starting again', () => {
  const {Recognition, made} = fakeRecognition(), seen = [];
  liveWords({Recognition, lang: 'en-IN', onWords: text => seen.push(text)});
  assert.deepEqual([made[0].continuous, made[0].interimResults, made[0].lang, made[0].started], [true, true, 'en-IN', true]);
  made[0].say('call mom');
  made[0].say('call mom at eight');
  made[0].onend();
  made[1].say(' and buy milk');
  assert.deepEqual(seen, ['call mom', 'call mom at eight', 'call mom at eight and buy milk']);
});

test('a browser with no recognizer, or one that refuses, shows nothing and stops trying', () => {
  assert.doesNotThrow(() => liveWords({Recognition: undefined, onWords() {}}).stop());
  const {Recognition, made} = fakeRecognition();
  liveWords({Recognition, onWords() {}});
  made[0].onerror({error: 'not-allowed'});
  made[0].onend();
  assert.equal(made.length, 1);
});

test('silence ends it after three empty runs, and stop aborts the recognizer', () => {
  const {Recognition, made} = fakeRecognition();
  const words = liveWords({Recognition, onWords() {}});
  made[0].onend(); made[1].onend(); made[2].onend();
  assert.equal(made.length, 3);
  const second = fakeRecognition();
  liveWords({Recognition: second.Recognition, onWords() {}}).stop();
  assert.equal(second.made[0].aborted, true);
  second.made[0].onend();
  assert.equal(second.made.length, 1, 'no restart after stop');
  words.stop();
});
