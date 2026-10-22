/** Sentence casing keeps the speaker's spelling, acronyms and mixed-case names. */
export function capitalizeTitle(value){
 const text=value.trim(),first=text.match(/\p{L}[\p{L}\p{N}]*/u)?.[0]??'';
 if(/^\p{Ll}.*\p{Lu}/u.test(first))return text;
 return text.replace(/^([^\p{L}]*)(\p{L})/u,(_,prefix,letter)=>prefix+letter.toLocaleUpperCase());
}
