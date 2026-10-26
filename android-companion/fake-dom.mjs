class FakeClassList{
 constructor(node){this.node=node;}
 get list(){return this.node.className.split(/\s+/).filter(Boolean);}
 set list(v){this.node.className=v.join(' ');}
 contains(c){return this.list.includes(c);}
 add(...cs){this.list=[...new Set([...this.list,...cs])];}
 remove(...cs){this.list=this.list.filter(c=>!cs.includes(c));}
 replace(a,b){if(!this.contains(a))return false;this.list=this.list.map(c=>c===a?b:c);return true;}
 toggle(c,force=!this.contains(c)){force?this.add(c):this.remove(c);return force;}
}

/** One part of a selector: tag, classes and [name=value] attributes, like `button.edit-chip[data-chip=time]`. */
function compound(part){
 const tag=part.match(/^[a-z]+/i)?.[0]?.toLowerCase();
 const classes=[...part.matchAll(/\.([\w-]+)/g)].map(m=>m[1]);
 const attrs=[...part.matchAll(/\[([\w-]+)(?:="?([^\]"]*)"?)?\]/g)].map(m=>[m[1],m[2]]);
 return node=>(!tag||node.tagName===tag)&&classes.every(c=>node.classList.contains(c))
  &&attrs.every(([k,v])=>v===undefined?node.getAttribute(k)!=null:node.getAttribute(k)===v);
}
/** A selector list with descendant and child combinators: `.a .b, ul > li`. */
function matcher(selector){
 const alternatives=selector.split(',').map(s=>s.trim().replace(/\s*>\s*/g,' > ').split(/\s+/));
 const chainMatches=(parts,node)=>{
  if(!compound(parts.at(-1))(node))return false;
  if(parts.length===1)return true;
  const child=parts.at(-2)==='>',rest=parts.slice(0,child?-2:-1);
  if(child)return !!node.parentNode&&chainMatches(rest,node.parentNode);
  for(let p=node.parentNode;p;p=p.parentNode)if(chainMatches(rest,p))return true;
  return false;
 };
 return node=>alternatives.some(parts=>chainMatches(parts,node));
}

/** Like a real NodeList: indexable and iterable, with forEach but no array methods. */
class FakeNodeList{
 constructor(nodes){nodes.forEach((n,i)=>{this[i]=n;});this.length=nodes.length;}
 item(i){return this[i]??null;}
 forEach(fn,self){for(let i=0;i<this.length;i++)fn.call(self,this[i],i,this);}
 *[Symbol.iterator](){for(let i=0;i<this.length;i++)yield this[i];}
}

export class FakeElement{
 constructor(tag){
  this.tagName=tag.toLowerCase();this.children=[];this.parentNode=null;this.className='';
  this.dataset={};this.attrs=new Map();this.listeners=new Map();this.ownText='';this.inert=false;this.value='';
  this.classList=new FakeClassList(this);
 }
 get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
 set textContent(v){this.children.forEach(c=>{c.parentNode=null;});this.children=[];this.ownText=String(v);}
 setAttribute(k,v){this.attrs.set(k,String(v));}
 removeAttribute(k){this.attrs.delete(k);}
 getAttribute(k){
  if(k.startsWith('data-'))return this.dataset[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]??null;
  return this.attrs.has(k)?this.attrs.get(k):null;
 }
 append(...nodes){
  for(const n of nodes){
   const node=typeof n==='string'?Object.assign(new FakeElement('#text'),{ownText:n}):n;
   node.parentNode?.children.splice(node.parentNode.children.indexOf(node),1);
   node.parentNode=this;this.children.push(node);
  }
 }
 appendChild(node){this.append(node);return node;}
 remove(){const p=this.parentNode;if(!p)return;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}
 get firstChild(){return this.children[0]??null;}
 get nextSibling(){const s=this.parentNode?.children;return s?s[s.indexOf(this)+1]??null:null;}
 get lastElementChild(){return this.children.at(-1)??null;}
 get childNodes(){return [...this.children];}
 replaceChildren(...nodes){this.textContent='';this.append(...nodes);}
 replaceWith(node){
  const p=this.parentNode;if(!p)return;
  node.parentNode?.children.splice(node.parentNode.children.indexOf(node),1);
  p.children[p.children.indexOf(this)]=node;node.parentNode=p;this.parentNode=null;
 }
 insertBefore(node,ref){
  if(!ref)return this.append(node);
  node.parentNode?.children.splice(node.parentNode.children.indexOf(node),1);
  this.children.splice(this.children.indexOf(ref),0,node);node.parentNode=this;
 }
 matches(selector){return matcher(selector)(this);}
 closest(selector){const m=matcher(selector);for(let n=this;n;n=n.parentNode)if(m(n))return n;return null;}
 querySelectorAll(selector){
  const m=matcher(selector),out=[];
  const walk=n=>n.children.forEach(c=>{if(m(c))out.push(c);walk(c);});
  walk(this);return new FakeNodeList(out);
 }
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 /** Fires an event that bubbles to the root, like a real tap. */
 dispatch(type,init={}){
  const event={type,target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...init};
  for(let n=this;n;n=n.parentNode)(n.listeners.get(type)??[]).forEach(fn=>fn.call(n,event));
  return event;
 }
 click(){return this.dispatch('click');}
 focus(){FakeElement.focused=this;}
}

/** Installs the fake `document` on globalThis for one test file. */
export function installFakeDom(){
 globalThis.document={createElement:tag=>new FakeElement(tag),documentElement:new FakeElement('html')};
 return globalThis.document;
}
