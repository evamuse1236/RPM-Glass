export function normalizeSpokenTime(normalized){
  const spoken={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
  // Only clock-shaped contexts repair a homophone; quantities and names stay untouched.
  normalized=normalized.replace(/\bat\s+for(?=\s+(?:thirty|forty(?:[ -]five)?|fifteen|twenty|ten)\b)/gi,'at four');
  const hour='one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
  const minute={'oh five':'05',ten:'10',fifteen:'15',twenty:'20','twenty five':'25',thirty:'30','thirty five':'35',forty:'40','forty five':'45',fifty:'50','fifty five':'55'};
  normalized=normalized.replace(new RegExp(`\\b(${hour})[ -]+(oh[ -]five|twenty[ -]five|thirty[ -]five|forty[ -]five|fifty[ -]five|ten|fifteen|twenty|thirty|forty|fifty)\\b`,'gi'),(match,h,m,offset,whole)=>{
    const prefix=whole.slice(0,offset),suffix=whole.slice(offset+match.length);
    if(!/^(?:\s*(?:today|tomorrow|morning|evening|night)\s*)?$/i.test(prefix)&&!/(?:at|to|by|past|before|after)\s+$/i.test(prefix))return match;
    if(!/^(?:\s*(?:am|pm|today|tomorrow|morning|evening|night))*(?:[.!?]|$)/i.test(suffix)&&!/^\s*(?:baje|in the (?:morning|evening|afternoon))\b/i.test(suffix))return match;
    return `${spoken[h.toLowerCase()]}:${minute[m.toLowerCase().replaceAll('-',' ')]}`;
  });
  const clockText=normalized.replace(/\b(half past|quarter past|quarter to)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,(_,part,h)=>`${part.toLowerCase()==='quarter to'?(spoken[h.toLowerCase()]+10)%12+1:spoken[h.toLowerCase()]}:${part.toLowerCase()==='half past'?'30':part.toLowerCase()==='quarter to'?'45':'15'}`).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?=\s+in the (?:morning|afternoon|evening)\b)/gi,h=>String(spoken[h.toLowerCase()])).replace(/\bat\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,(_,h)=>'at '+spoken[h.toLowerCase()]).replace(/(\d(?::\d{2})?)\s*(?:o'clock\s*)?in the (morning|afternoon|evening)\b/gi,(_,h,p)=>h+(p.toLowerCase()==='morning'?'am':'pm'));
  const rangeText=clockText.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?=[ap]\.?m\.?\b)/gi,(_,word)=>String(spoken[word.toLowerCase()]))
    .replace(/\b(from|between)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(to|and)\s+/gi,(_,prefix,word,join)=>`${prefix} ${spoken[word.toLowerCase()]} ${join} `)
    .replace(/\bbetween\s+([\d: .apm]+)\s+and\s+([\d: .apm]+)/gi,'from $1 to $2');
  return rangeText;
}
