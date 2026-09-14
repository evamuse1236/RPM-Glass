export async function sha256(value:string):Promise<string> {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function randomSecret(bytes=32):string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function canonicalJson(value:unknown):string {
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(canonicalJson).join(",")+"]";
  const object=value as Record<string,unknown>;
  return "{"+Object.keys(object).sort().map(key=>JSON.stringify(key)+":"+canonicalJson(object[key])).join(",")+"}";
}
