import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'app/src/main/assets/companion');fs.mkdirSync(out,{recursive:true});
await build({absWorkingDir:root,entryPoints:['android-companion/runtime.mjs'],outfile:path.join(out,'runtime.js'),bundle:true,format:'esm',platform:'browser',target:'chrome100',plugins:[{name:'native-boundaries',setup(b){
  b.onResolve({filter:/^node:crypto$/},()=>({path:'crypto',namespace:'native'}));
  b.onResolve({filter:/cli\/openrouter\.mjs$/},()=>({path:'openrouter',namespace:'native'}));
  b.onLoad({filter:/.*/,namespace:'native'},args=>({contents:args.path==='crypto'?'export const randomUUID=()=>globalThis.crypto.randomUUID();':"export const ENDPOINT='https://openrouter.ai/api/v1/chat/completions';"}));
}}]});
for(const file of ['index.html','night.css','planner.html','planner-stitch.css'])fs.copyFileSync(path.join(root,'android-companion',file),path.join(out,file));
fs.copyFileSync(path.join(root,'android-companion/assets/butterfly.png'),path.join(out,'butterfly.png'));
for(const file of fs.readdirSync(path.join(root,'android-companion/assets/fonts')))fs.copyFileSync(path.join(root,'android-companion/assets/fonts',file),path.join(out,file));
// Retired generated bundle files only; source/reference artwork is preserved.
for(const file of ['pixel.css','garden.png','planner.css'])fs.rmSync(path.join(out,file),{force:true});
console.log('Bundled offline Android companion assets (no credentials or personal data).');
