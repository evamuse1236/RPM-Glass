/** Exact snippets verified in pinned public source. This is intentionally a small
 * UX/prompt hotfix, not the new planning engine or a fix for the sort-preview bug.
 */
const compactOld="if(platform.compactReply){const latest=c.messages.findLast(m=>m.role==='assistant');if(!latest){content.append(el('p','assistant-text dialogue','What’s on your mind?'));return;}const rendered=message(latest);rendered.querySelector('.assistant-text')?.classList.add('dialogue');content.append(rendered);return;}";
const compactNew=`if(platform.compactReply){
    const latest=c.messages.findLast(m=>m.role==='assistant');
    const latestUser=c.messages.findLast(m=>m.role==='user');
    if(latestUser)content.append(el('p','user-text',latestUser.text));
    if(!latest)content.append(el('p','assistant-text dialogue',latestUser?'Your thought is here.':'What’s on your mind?'));
    else {const rendered=message(latest);rendered.querySelector('.assistant-text')?.classList.add('dialogue');content.append(rendered);}
    if(state.pending){
      const review=el('details','pending');review.append(el('summary','',\`Review \${state.pending.operations.length} proposed changes\`));
      for(const op of state.pending.operations){const name=op.fields.title??state.entries.find(e=>e.id===op.id)?.title??op.collection;
        const changes=Object.entries(op.fields).filter(([k])=>!['title','kind'].includes(k)).map(([k,v])=>\`\${k}: \${v===null?'unresolved / clear — review':v}\`).join(' · ');
        review.append(el('p','proposal-row',name+(changes?' — '+changes:'')));}
      review.append(el('p','',state.pending.question),button('Leave this proposal',()=>turn({type:'cancel'}),'quiet'));content.append(review);
    }
    return;
  }`;
export const specs=[
 {path:'chat-prototype/companion-agent.mjs',blob:'0cb4a4e17ae5d2fa3c9b3bb7f4817ad51acc3a47',edits:[
  ['You are RPM, a conversational personal assistant, not a coach. Talk naturally and briefly.','You are RPM, a warm, practical planning companion. Be emotionally attentive, brief, and useful. Help the user find a meaningful outcome and a small next step, without forcing coaching onto a simple capture.'],
  ['Suggestion labels must normally be one word, two at most; answer text carries the full meaning.','Suggestion labels should be short but complete: normally two to four useful words. Do not sacrifice meaning to a word limit; answer text carries the exact action.']
 ]},
 {path:'chat-prototype/companion-tools.mjs',blob:'8e08592a755892f6e3daf0d542ef7b88f9b313a5',edits:[
  ['No coaching.','Offer brief, autonomy-supporting coaching when useful; do not turn every feeling into a task.'],
  ["label:'Add a note',text:","label:'Add purpose',text:"]
 ]},
 {path:'chat-prototype/app.js',blob:'e25d1cde88e6c50b382f3462d68e3d11eba5df49',edits:[
  ["const label=platform.native?s.label.trim().split(/\\s+/).slice(0,2).join(' '):s.label;","const label=s.label.trim();"],
  ["if(platform.goalIdeas&&view==='chat'&&!state.pending){","if(platform.goalIdeas&&view==='chat'&&!state.pending&&!currentConversation().messages.length){"],
  [compactOld,compactNew]
 ]}
];
export function replaceExactly(source,edits){let next=source;for(const [old,replacement] of edits){if(next.split(old).length!==2)throw new Error('Expected exactly one verified source anchor; refusing a blind patch');next=next.replace(old,replacement);}return next;}
