// A deliberately small, text-only Markdown subset. Never interpret HTML or URLs.
export function replyBlocks(text=''){
  const blocks=[];let paragraph=[],list=null,code=null;
  const flush=()=>{if(paragraph.length){blocks.push({type:'p',text:paragraph.join('\n')});paragraph=[];}list=null;};
  for(const line of String(text).replace(/\r\n?/g,'\n').split('\n')){
    if(/^\s*```/.test(line)){flush();if(code){blocks.push({type:'pre',text:code.join('\n')});code=null;}else code=[];continue;}
    if(code){code.push(line);continue;}
    if(!line.trim()){flush();continue;}
    const heading=line.match(/^#{1,6}\s+(.+)$/),item=line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
    if(heading){flush();blocks.push({type:'h3',text:heading[1]});}
    else if(item){if(paragraph.length)flush();const type=item[1]?'ul':'ol';if(!list||list.type!==type){list={type,items:[]};blocks.push(list);}list.items.push(item[2]);}
    else{list=null;paragraph.push(line);}
  }
  if(code)blocks.push({type:'pre',text:code.join('\n')});flush();return blocks;
}
export function formattedReply(text,doc=document){
  const root=doc.createElement('div');root.className='assistant-text formatted-reply';
  function inline(node,value){const pieces=value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);for(const part of pieces){const bold=part.startsWith('**')&&part.endsWith('**'),code=part.startsWith('`')&&part.endsWith('`');if(bold||code){const span=doc.createElement(bold?'strong':'code');span.textContent=part.slice(bold?2:1,bold?-2:-1);node.append(span);}else node.append(doc.createTextNode(part));}}
  for(const block of replyBlocks(text)){const node=doc.createElement(block.type);if(block.items)for(const item of block.items){const li=doc.createElement('li');inline(li,item);node.append(li);}else if(block.type==='pre'){const code=doc.createElement('code');code.textContent=block.text;node.append(code);}else inline(node,block.text);root.append(node);}return root;
}
