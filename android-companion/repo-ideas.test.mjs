import test from 'node:test';
import assert from 'node:assert/strict';
import {ideaTitle,prepareIdea,recentRepos,filterRepos} from './repo-ideas.mjs';

const at=new Date(2026,9,6,19,24,9);

test('a spoken ramble becomes a short title in Dara\'s own words',()=>{
 assert.equal(ideaTitle('So um, add a dark mode toggle to the planner. It should follow the system.'),'Add a dark mode toggle to the planner');
 assert.equal(ideaTitle('',{shots:2}),'Screenshots idea');
 const long=ideaTitle('Let the weekly review show every Result with its deadline and the free time before it so I can see what fits this week');
 assert.ok(long.length<=72&&long.endsWith('…'),long);
});

test('an idea keeps the exact words and screenshots in a folder per repo',()=>{
 const idea=prepareIdea({repo:'evamuse1236/RPM-Glass',text:'Um, swipe to archive in the Inbox.\nLike Gmail.',shots:['a','b'],date:at});
 assert.equal(idea.folder,'evamuse1236/RPM-Glass/2026-10-06-1924-swipe-to-archive-in-the-inbox');
 assert.deepEqual(idea.shots,[{id:'a',name:'shot-1.jpg'},{id:'b',name:'shot-2.jpg'}]);
 assert.match(idea.markdown,/^---\ntitle: "Swipe to archive in the Inbox"\nrepo: evamuse1236\/RPM-Glass\nstatus: new\ncaptured: 2026-10-06T19:24:09\+05:30\n/);
 assert.ok(idea.markdown.includes('\nUm, swipe to archive in the Inbox.\nLike Gmail.\n'));
 assert.ok(idea.markdown.endsWith('![Screenshot 2](shot-2.jpg)\n'));
});

test('a new repo idea is filed under new/ with its name',()=>{
 const idea=prepareIdea({newName:'Flat chores',text:'A tiny app that splits chores',date:at});
 assert.equal(idea.folder,'new/2026-10-06-1924-flat-chores');
 assert.match(idea.markdown,/\nrepo: new\nnew_repo: "Flat chores"\n/);
 assert.throws(()=>prepareIdea({repo:'evamuse1236/RPM-Glass',text:'  '}),/idea first/);
});

test('repo chips lead with the repo in use, then Dara\'s recent picks, then recent pushes',()=>{
 const repos=[{fullName:'evamuse1236/a',pushedAt:'2026-10-01'},{fullName:'evamuse1236/b',pushedAt:'2026-10-05'},{fullName:'evamuse1236/c',pushedAt:'2026-10-03'}];
 assert.deepEqual(recentRepos({selected:'evamuse1236/c',used:['evamuse1236/a','evamuse1236/c'],repos,limit:3}).map(r=>r.fullName),['evamuse1236/c','evamuse1236/a','evamuse1236/b']);
 assert.deepEqual(filterRepos([{fullName:'x/notes',description:'rpm'},{fullName:'x/rpm-agent'}],'rpm').map(r=>r.fullName),['x/rpm-agent','x/notes']);
});
