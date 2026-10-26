import kinds from "../web/contract/records.json";
import { validateRecord } from "../web/contract/validate.mjs";

export function object(value:unknown,allowed:string[]):Record<string,any> {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(key=>!allowed.includes(key)))throw new Error("Invalid planner request");
  return value as Record<string,any>;
}
const integer=(value:any,min=0)=>Number.isSafeInteger(value) && value>=min;
export function validatePush(input:unknown) {
  const value=object(input,["seq","part","final","changes"]);
  if(!integer(value.seq,1) || !integer(value.part) || typeof value.final!=="boolean" || !Array.isArray(value.changes) || value.changes.length>200)throw new Error("Invalid push part");
  if(new TextEncoder().encode(JSON.stringify(value)).length>800000)throw new Error("Push part exceeds 800 KB");
  const keys=new Set();
  for(const raw of value.changes) {
    const change=object(raw,["key","baseRev","base","value","stamps"]);
    if(typeof change.key!=="string" || !Object.hasOwn(change,"base") || !Object.hasOwn(change,"value") || !Object.hasOwn(change,"baseRev") || change.baseRev!==null && !integer(change.baseRev) || keys.has(change.key))throw new Error("Invalid record change");
    keys.add(change.key);
    validateRecord(change.key,change.value);validateRecord(change.key,change.base);
    if(change.baseRev===null && change.base!==null)throw new Error("New record base must be null");
    const spec=kinds[change.key.split(":")[0] as keyof typeof kinds];
    if(!change.stamps || typeof change.stamps!=="object" || Array.isArray(change.stamps))throw new Error("Invalid stamps");
    for(const [group,stamp] of Object.entries(change.stamps))if(!Object.hasOwn(spec.groups,group) || typeof stamp!=="string")throw new Error("Invalid stamp");
    for(const stamp of Object.values(change.stamps))validateRecord("waterSnooze:main",stamp);
  }
  return value;
}
export function validatePull(input:unknown) {
  const value=object(input,["after","limit"]);
  if(!integer(value.after) || !integer(value.limit,1) || value.limit>500)throw new Error("Invalid pull cursor");
  return value;
}
