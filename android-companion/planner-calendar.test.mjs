import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarRisk,calendarRows} from './planner-calendar.mjs';
test('calendar freshness and coverage never imply free time on failure',()=>{
 for(const status of ['stale','unavailable','incomplete'])assert.ok(calendarRisk({status},10,20));
 assert.ok(calendarRisk({status:'ready',start:11,end:30},10,20));
 assert.ok(calendarRisk({status:'ready',start:0,end:19},10,20));
 assert.equal(calendarRisk({status:'ready',start:0,end:30},10,20),null);
 assert.equal(calendarRisk({status:'not_selected'},10,20),null);
 assert.equal(calendarRisk({status:'permission_needed',configured:false},10,20),null);
 assert.ok(calendarRisk({status:'permission_needed',configured:true},10,20));
});
test('malformed native calendar records are not timeline events',()=>{
 assert.equal(calendarRows({events:[{title:'Meeting',start:1,end:2},{title:'Bad',start:2,end:1},{title:'Bad',start:'now',end:3}]}).length,1);
});
