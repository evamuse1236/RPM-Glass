import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceUnits} from '../src/context.mjs';

for(const period of ['p.m.','a.m.','P.M.','A.M.'])test(`a dotted clock keeps one exact source: ${period}`,()=>{
 const raw=`Have a shower tomorrow evening at 6:00 ${period} Buy milk.`;
 const units=sourceUnits(raw);
 assert.deepEqual(units.map(u=>u.text),[`Have a shower tomorrow evening at 6:00 ${period}`,'Buy milk.']);
 for(const u of units)assert.equal(raw.slice(u.start,u.end),u.text);
});
