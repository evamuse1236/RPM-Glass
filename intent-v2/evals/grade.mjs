/** Coarse, deterministic contracts. Passing is NOT proof of semantic correctness. */
export function grade(turn,expected){
 const failures=[],ops=turn.operations,fields=ops.flatMap(o=>o.fields.map(f=>f.name));
 const check=(yes,text)=>{if(!yes)failures.push(text);};
 if(expected.minOperations!==undefined)check(ops.length>=expected.minOperations,`Expected at least ${expected.minOperations} operations`);
 if(expected.maxOperations!==undefined)check(ops.length<=expected.maxOperations,`Expected at most ${expected.maxOperations} operations`);
 if(expected.minMemories!==undefined)check(turn.memoryCandidates.length>=expected.minMemories,'Missing expected memory candidate');
 if(expected.maxMemories!==undefined)check(turn.memoryCandidates.length<=expected.maxMemories,'Unexpected memory candidate');
 if(expected.question!==undefined)check(!!turn.question===expected.question,'Wrong blocking-question behaviour');
 if(expected.mode)check(expected.mode.includes(turn.mode),'Wrong conversation mode');
 if(expected.kinds)check(ops.every(o=>expected.kinds.includes(o.kind)),'Wrong mutation kind');
 if(expected.targetIds)check(expected.targetIds.every(id=>ops.some(o=>o.targetId===id))&&ops.every(o=>expected.targetIds.includes(o.targetId)),'Wrong target IDs');
 for(const f of expected.requireFields??[])check(fields.includes(f),`Missing field: ${f}`);
 for(const f of expected.forbidFields??[])check(!fields.includes(f),`Unrequested field: ${f}`);
 return failures;
}
