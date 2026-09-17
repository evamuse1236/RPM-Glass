import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {specs,replaceExactly} from './hotfix-spec.mjs';
const args=process.argv.slice(2),i=args.indexOf('--repo'),repo=resolve(i>=0?args[i+1]:process.cwd()),write=args.includes('--apply');
if(!write&&!args.includes('--check')){console.error('Usage: node patches/apply-hotfixes.mjs --repo /path/to/RPM-Glass --check | --apply');process.exit(2);}
const blob=bytes=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');
try{
 const changes=[];
 for(const spec of specs){const path=join(repo,spec.path),bytes=await readFile(path);if(blob(bytes)!==spec.blob)throw new Error(`${spec.path} differs from inspected commit 22604e6. No files changed. Manually review the hotfix instead.`);changes.push({path,relative:spec.path,old:bytes,next:replaceExactly(bytes.toString('utf8'),spec.edits)});}
 console.log('All three file hashes and all replacement anchors match the inspected source.');
 if(write){const backup=join(repo,'.rpm-hotfix-backup-'+Date.now());await mkdir(backup,{recursive:true});for(const change of changes){const target=join(backup,change.relative);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(change.path,target);}
  const written=[];try{for(const c of changes){await writeFile(c.path,c.next);written.push(c);}}catch(error){for(const c of written)await writeFile(c.path,c.old);throw error;}
  console.log(`Applied source-only hotfix. Backup: ${backup}`);console.log('Review git diff, run original tests, rebuild bundled Android assets, and test on device. No APK was built or released.');
 }else console.log('Dry run only. Nothing changed.');
}catch(error){console.error(error.message);process.exitCode=1;}
