import test from 'node:test';
import assert from 'node:assert/strict';
import {liveSetup,systemPrompt,SPOKEN_LANGUAGES} from './voice-tools.mjs';

const NOW=new Date('2026-11-03T04:30:00Z'),TZ='Asia/Kolkata';

test('speech recognition is biased to English, Hindi and Marathi on both the phone and the website', () => {
 assert.deepEqual(SPOKEN_LANGUAGES,['en-IN','hi-IN','mr-IN']);
 for(const continuous of [true,false])assert.deepEqual(liveSetup(NOW,TZ,{continuous}).inputAudioTranscription,{languageCodes:['en-IN','hi-IN','mr-IN']});
});

test('the voice prompt keeps titles to the action and ignores lone words and other languages', () => {
 const prompt=systemPrompt(NOW,TZ,{continuous:true});
 assert.match(prompt,/A title is the action alone/);
 assert.match(prompt,/Never put a time, a day/);
 assert.match(prompt,/A lone word or a few words with no verb/);
 assert.match(prompt,/other than English, Hindi or Marathi is noise/);
});
