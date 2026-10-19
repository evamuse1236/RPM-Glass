const fnv=(text,seed)=>{let h=seed>>>0;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');};

/** A short local fingerprint of text: equal text gives the same 16 hex digits, and the text cannot be read back. */
export const shortHash=text=>{const s=String(text??'');return fnv(s,0x811c9dc5)+fnv(s,0x01000193);};
