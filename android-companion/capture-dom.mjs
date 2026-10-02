// Small DOM builders shared by the Capture views. Text is always set as text.

export function el(tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined&&text!==null)node.textContent=text;
 return node;
}

/** A Material Symbols ligature. Decorative unless given a label. */
export function icon(name,{fill=false,cls=''}={}){
 const node=el('span',['ms',fill?'fill':'',cls].filter(Boolean).join(' '),name);
 node.setAttribute('aria-hidden','true');
 return node;
}

/** A Material button: role is filled, tonal, outlined or text. */
export function button(label,onClick,{role='text',iconName=null,ariaLabel=null,cls=''}={}){
 const node=el('button',['btn','btn-'+role,cls].filter(Boolean).join(' '));
 node.type='button';
 if(iconName)node.append(icon(iconName));
 node.append(el('span','btn-label',label));
 if(ariaLabel)node.setAttribute('aria-label',ariaLabel);
 if(onClick)node.addEventListener('click',onClick);
 return node;
}

export function iconButton(name,label,onClick,{cls='',fill=false,pressed=null}={}){
 const node=el('button',['icon-btn',cls].filter(Boolean).join(' '));
 node.type='button';
 node.setAttribute('aria-label',label);
 if(pressed!==null)node.setAttribute('aria-pressed',String(pressed));
 node.append(icon(name,{fill}));
 if(onClick)node.addEventListener('click',onClick);
 return node;
}

/** An M3 assist chip. Interactive when given a handler. */
export function chip(label,{iconName=null,onClick=null,ariaLabel=null,cls=''}={}){
 const node=el(onClick?'button':'span',['chip',cls].filter(Boolean).join(' '));
 if(onClick){node.type='button';node.addEventListener('click',onClick);}
 if(iconName)node.append(icon(iconName));
 node.append(el('span','chip-label',label));
 if(ariaLabel)node.setAttribute('aria-label',ariaLabel);
 return node;
}

/** The disclosure that keeps original words out of the way but one tap away. */
export function details(summary,children,cls='details'){
 const node=el('details',cls);
 const head=el('summary');
 head.append(el('span','',summary),icon('expand_more',{cls:'chev'}));
 node.append(head,...children);
 return node;
}
