// Repo ideas: what the widget's repo capture saves for Claude and Codex to pick up later.
// Each idea is one folder in the ideas repo (second-brain by default): idea.md, written here,
// plus its screenshots. The phone uploads the files exactly as given; nothing here is sent to a model.

const FILLER=/^(?:(?:so|um+|uh+|okay|ok|like|yeah|hmm+|right|and|basically|i think|i was thinking)[\s,.…-]+)+/i;

/** A short title from Dara's own words: the first sentence of the first line, fillers trimmed, at most 72 characters. */
export function ideaTitle(text,{shots=0}={}){
 const line=String(text??'').split(/\n/).map(s=>s.trim()).find(Boolean)??'';
 let title=line.replace(FILLER,'');
 title=(title.match(/^.+?[.!?](?=\s|$)/)?.[0]??title).replace(/[.!?\s]+$/,'').trim();
 if(!title)return shots?(shots===1?'Screenshot idea':'Screenshots idea'):'Untitled idea';
 title=title[0].toUpperCase()+title.slice(1);
 if(title.length<=72)return title;
 const cut=title.slice(0,71),space=cut.lastIndexOf(' ');
 return (space>40?cut.slice(0,space):cut).replace(/[\s,;:-]+$/,'')+'…';
}

export function slug(text,max=48){
 const s=String(text??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 const cut=s.slice(0,max).replace(/-[^-]*$/,'');
 return (s.length>max?cut||s.slice(0,max):s)||'idea';
}

const pad=n=>String(n).padStart(2,'0');
export function stamp(date){return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;}

/** Local time with its offset, so "captured" reads as Dara's clock. */
export function localIso(date){
 const off=-date.getTimezoneOffset(),sign=off>=0?'+':'-',abs=Math.abs(off);
 return `${stamp(date).slice(0,10)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`;
}

export const isRepoName=value=>/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(String(value??''));
export const shortName=fullName=>String(fullName??'').split('/').pop();

/** Where the idea goes under the ideas folder: owner/repo/stamp-slug, or new/stamp-slug for a repo that doesn't exist yet. */
export function ideaFolder({repo,newName='',title,date}){
 const leaf=`${stamp(date)}-${slug(repo?title:(newName||title))}`;
 return repo?`${repo}/${leaf}`:`new/${leaf}`;
}

/**
 * The idea file. Frontmatter is what the pull-from-recent skill filters on; the body keeps
 * Dara's words exactly as typed or dictated, then the screenshots.
 */
export function ideaMarkdown({repo,newName='',text,title,date,shots=[],source='RPM widget'}){
 const q=JSON.stringify;
 const front=[
  '---',
  `title: ${q(title)}`,
  `repo: ${repo?repo:'new'}`,
  ...(repo?[]:[`new_repo: ${q(newName.trim())}`]),
  'status: new',
  `captured: ${localIso(date)}`,
  `source: ${source}`,
  `screenshots: [${shots.join(', ')}]`,
  '---',
 ];
 const body=[`# ${title}`,''];
 const words=String(text??'').trim();
 if(words)body.push(words,'');
 shots.forEach((name,i)=>body.push(`![Screenshot ${i+1}](${name})`,''));
 return front.join('\n')+'\n\n'+body.join('\n').replace(/\n+$/,'\n');
}

/** Everything the phone needs to save one idea and upload it later, even without the page open. */
export function prepareIdea({repo=null,newName='',text='',shots=[],date=new Date(),source}){
 if(repo&&!isRepoName(repo))throw new Error('Choose a repo.');
 const words=String(text).trim();
 if(!words&&!shots.length)throw new Error('Say or type the idea first.');
 const names=shots.map((_,i)=>`shot-${i+1}.jpg`);
 const title=ideaTitle(words,{shots:shots.length});
 return {
  id:crypto.randomUUID(),
  repo,newName:repo?'':newName.trim(),title,
  folder:ideaFolder({repo,newName:newName.trim(),title,date}),
  markdown:ideaMarkdown({repo,newName,text:words,title,date,shots:names,source}),
  shots:shots.map((id,i)=>({id,name:names[i]})),
 };
}

/**
 * The repo chips: the repo in use first, then the repos Dara saved ideas for most recently, then those
 * pushed most recently on GitHub. Names the phone no longer sees on GitHub still count; they were Dara's choice.
 */
export function recentRepos({selected=null,used=[],repos=[],limit=4}){
 const known=new Map(repos.map(r=>[r.fullName.toLowerCase(),r]));
 const out=[],seen=new Set();
 const add=name=>{
  if(!name||out.length>=limit)return;
  const key=name.toLowerCase();
  if(seen.has(key))return;
  seen.add(key);out.push(known.get(key)??{fullName:name,name:shortName(name)});
 };
 add(selected);
 for(const name of used)add(name);
 for(const r of [...repos].sort((a,b)=>String(b.pushedAt??'').localeCompare(String(a.pushedAt??''))))add(r.fullName);
 return out;
}

/** The "More repos" search: every word must appear in the name or description; name matches first. */
export function filterRepos(repos,query){
 const words=String(query??'').toLowerCase().split(/\s+/).filter(Boolean);
 if(!words.length)return repos;
 const scored=[];
 for(const r of repos){
  const name=r.fullName.toLowerCase(),text=name+' '+String(r.description??'').toLowerCase();
  if(!words.every(w=>text.includes(w)))continue;
  scored.push([words.every(w=>name.includes(w))?0:1,r]);
 }
 return scored.sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}
