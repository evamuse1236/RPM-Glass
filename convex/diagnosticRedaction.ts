// Defense in depth: clients redact before disk, ingestion redacts again.
const sensitive = /^(authorization|proxy.?authorization|cookie|set.?cookie|.*password.*|.*secret.*|.*api[_-]?key.*|.*private[_-]?key.*|.*credential.*|access[_-]?token|refresh[_-]?token|client[_-]?token|session[_-]?token|token|pairing[_-]?code)$/i;
export function redactText(value:string):string {
  return value.replace(/\bBearer\s+[^\s"'<>]+/gi,"Bearer [REDACTED]")
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}/g,"[REDACTED]")
    .replace(/\bAIz[a][0-9A-Za-z_-]{20,}/g,"[REDACTED]")
    .replace(/\bA[Q]\.[0-9A-Za-z_-]{20,}/g,"[REDACTED]")
    .replace(/auth_tokens\/[A-Za-z0-9_-]+/g,"auth_tokens/[REDACTED]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,"[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie|pairing[_-]?code)["']?\s*[:=]\s*["']?)[^\s,;&"'<>}]+/gi,"$1[REDACTED]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,"$1[REDACTED]@");
}
export function redact(value:unknown,depth=0):unknown {
  if(depth>20)return "[Depth limit]";
  if(typeof value==="string")return redactText(value);
  if(Array.isArray(value))return value.map(v=>redact(v,depth+1));
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitive.test(k)?"[REDACTED]":redact(v,depth+1)]));
  return value;
}
// Convex stores only field names of non-control ASCII that do not start with '$'.
// A console key outside that (a Hindi or accented word, "$ref") is percent-escaped
// rather than losing the event; '%' itself is escaped, so two keys never meet.
function storableKey(key:string):string {
  return Array.from(key,(ch,i)=>{const code=ch.codePointAt(0)!;
    return code<32||code>=127||ch==="%"||(i===0&&ch==="$")?Array.from(new TextEncoder().encode(ch),b=>"%"+b.toString(16).toUpperCase().padStart(2,"0")).join(""):ch;}).join("");
}
export function storableKeys(value:unknown):unknown {
  if(Array.isArray(value))return value.map(storableKeys);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[storableKey(k),storableKeys(v)]));
  return value;
}
