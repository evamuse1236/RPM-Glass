import fs from 'node:fs';
import assert from 'node:assert/strict';
const luminance=hex=>{const rgb=hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const ratio=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
const themes={dark:{surface:'#171A20',primary:'#ECEEF2',secondary:'#A9AFBA',accent:'#8FA8FF',onAccent:'#0E1014',outline:'#788291'},light:{surface:'#FFFFFF',primary:'#20242C',secondary:'#515B69',accent:'#3755B3',onAccent:'#FFFFFF',outline:'#788291'}};
const results=[];for(const [theme,t] of Object.entries(themes)){for(const token of ['primary','secondary']){const value=ratio(t[token],t.surface);assert.ok(value>=4.5);results.push({theme,token,ratio:+value.toFixed(2)});}assert.ok(ratio(t.accent,t.onAccent)>=4.5);assert.ok(ratio(t.outline,t.surface)>=3);}
for(const path of ['android-companion/planner-stitch.css','android-companion/night.css']){const css=fs.readFileSync(path,'utf8');assert.equal(/#[0-9a-f]{3,8}\b/i.test(css),false,`${path}: move colour literals to its scoped token stylesheet`);assert.equal(/\b\d+(?:\.\d+)?(?:px|sp|dp)\b/.test(css),false,`${path}: use a named dimension token`);}

// Capture has its own composited material. Check text-bearing controls over the
// lightest and darkest possible host backdrops, using the shipping tokens.
const captureCss=fs.readFileSync('android-companion/capture-tokens.css','utf8');
const tokenMap=block=>Object.fromEntries([...block.matchAll(/(--cap-[\w-]+):([^;]+);/g)].map(m=>[m[1],m[2]]));
const captureLight=tokenMap(captureCss.split('.capture-root {')[1].split('}')[0]);
const captureDark={...captureLight,...tokenMap(captureCss.split(':root[data-appearance=dark] .capture-root {')[1].split('}')[0])};
const color=value=>value.startsWith('#')?[...value.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16)).concat(1):value.match(/[\d.]+/g).map(Number);
const over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+bg[i]*(1-(fg[3]??1))).concat(1);
const hex=rgb=>'#'+rgb.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const captureResults=[];
for(const [theme,t] of Object.entries({light:captureLight,dark:captureDark}))for(const backdrop of [[0,0,0,1],[255,255,255,1]]){
 const surface=over(color(t['--cap-surface']),backdrop),strong=over(color(t['--cap-strong']),surface);
 for(const name of ['text','muted']){const value=ratio(t['--cap-'+name],hex(strong));assert.ok(value>=4.5,`${theme} Capture ${name}: ${value}`);captureResults.push({theme,backdrop:backdrop[0],token:name,ratio:+value.toFixed(2)});}
 const outline=over(color(t['--cap-control']),strong),value=ratio(hex(outline),hex(strong));assert.ok(value>=3,`${theme} Capture control outline: ${value}`);
 captureResults.push({theme,backdrop:backdrop[0],token:'control',ratio:+value.toFixed(2)});
}


// Response text uses Strong material over the glass shell.
const cardResults=[];
for(const [theme,t] of Object.entries({light:captureLight,dark:captureDark}))for(const backdrop of [[0,0,0,1],[255,255,255,1]]){
 const base=over(color(t['--cap-surface']),backdrop);
 let glow=base;for(const name of ['cyan','violet','blue']){const tint=color(t['--cap-'+name]);tint[3]*=.4;glow=over(tint,glow);}
 const card=over(color(t['--cap-card']),glow);
 for(const name of ['text','muted']){const value=ratio(t['--cap-'+name],hex(card));assert.ok(value>=4.5,`${theme} Capture card ${name}: ${value}`);cardResults.push({theme,backdrop:backdrop[0],token:name,ratio:+value.toFixed(2)});}
}

const waitingResults=[];
for(const [theme,t] of Object.entries({light:captureLight,dark:captureDark}))for(const wave of ['cyan','violet','blue']){
 const background=over(color(t['--cap-'+wave]),over(color(t['--cap-strong']),[255,255,255,1]));
 const value=ratio(t['--cap-text'],hex(background));assert.ok(value>=4.5,`${theme} waiting band text against ${wave}: ${value}`);waitingResults.push({theme,wave,ratio:+value.toFixed(2)});
}
console.log(JSON.stringify({semanticSurfaceRules:true,contrast:results,captureContrast:captureResults,cardContrast:cardResults,waitingBandContrast:waitingResults},null,2));
