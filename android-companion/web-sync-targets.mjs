// Targets describe the records an op may replace, including priority and unlink cascades.
// New records and logs are additive. A batch takes the union of its children's targets.
export function targets(op) {
  const task = id => ({kind: 'task', id});
  const entity = (collection, id) => ({kind: 'entity', collection, id});
  const group = id => ({kind: 'group', id: id ?? null});
  const week = id => ({kind: 'week', id});
  const review = id => ({kind: 'review', id});
  const destination = id => id == null ? [] : [entity('blocks', id)];
  switch (op.type) {
    case 'batch': return op.ops.flatMap(targets);
    case 'saveTask': return !op.id ? [] : [task(op.id), ...('blockId' in op.fields || 'priority' in op.fields ? [{kind: 'taskGroup', id: op.id}, ...('blockId' in op.fields ? [group(op.fields.blockId), ...destination(op.fields.blockId)] : [])] : [])];
    case 'reopenTask': case 'archiveTask': case 'restoreTask': return [task(op.id)];
    case 'moveTask': return [task(op.id), {kind: 'taskGroup', id: op.id}, group(op.blockId), ...destination(op.blockId)];
    case 'reorder': return [group(op.blockId), ...destination(op.blockId)];
    case 'sortExisting': return op.assignments.flatMap(a => [group(null), group(a.blockId), ...destination(a.blockId), ...a.taskIds.map(task)]);
    case 'saveEntity': return !op.id ? [] : [entity(op.collection, op.id), ...['projectId', 'goalId', 'areaId'].flatMap(key => op.fields[key] ? [entity({projectId: 'projects', goalId: 'goals', areaId: 'areas'}[key], op.fields[key])] : [])];
    case 'removeEntity': return [entity(op.collection, op.id), {kind: 'links', collection: op.collection, id: op.id}];
    case 'archiveBlock': return [entity('blocks', op.id)];
    case 'rateAreas': return op.ratings.map(r => entity('areas', r.id));
    case 'context': return [{kind: 'context'}];
    case 'markAchieved': return [entity('blocks', op.id), ...(op.week ? [week(op.week)] : [])];
    case 'setWeekFocus': return [week(op.week), ...op.ids.map(id => entity('blocks', id))];
    case 'finishReview': return [week(op.week), review(op.week), ...op.ids.map(id => entity('blocks', id))];
    case 'reviewProgress': return [review(op.week)];
    case 'reviewTask': return [task(op.id), week(op.week)];
    case 'groupTask': case 'groupTasks': return [...(op.ids ?? [op.id]).flatMap(id => [task(id), {kind: 'taskGroup', id}]), ...(!op.newBlock ? [group(op.blockId), ...destination(op.blockId)] : [])];
    case 'saveRoutine': return op.routine.id ? [{kind: 'routine', id: op.routine.id}] : [];
    case 'removeRoutine': return [{kind: 'routine', id: op.id}];
    case 'saveRoutineRun': return [{kind: 'routine', id: op.run.routineId}, {kind: 'run', id: op.run.routineId, day: op.run.day}];
    case 'skipRoutineDay': return [{kind: 'routine', id: op.routineId}, {kind: 'run', id: op.routineId, day: op.day}];
    case 'drinkWater': return [];
    case 'setWater': return [{kind: 'waterSettings'}];
    case 'snoozeWater': return [{kind: 'waterSnooze'}];
    case 'saveMeal': return op.meal.id ? [{kind: 'meal', id: op.meal.id}, {kind: 'mealGuess', id: op.meal.id}] : [];
    case 'removeMeal': case 'setMealGuess': return [{kind: 'meal', id: op.id}, {kind: 'mealGuess', id: op.id}];
    case 'setMealSlot': case 'removeMealSlot': return [{kind: 'mealSlot', id: op.slot}];
    default: throw new Error('Unknown planner target.');
  }
}

export function targetRecord(snapshot, target) {
  const {entries, planner: p} = snapshot, body = p.body;
  const byId = rows => rows.find(r => r.id === target.id) ?? null;
  const group = id => entries.filter(t => !t.archived && (t.blockId ?? null) === id).sort((a, b) => a.id - b.id);
  switch (target.kind) {
    case 'task': return byId(entries);
    case 'entity': return byId(p[target.collection]);
    case 'group': return group(target.id);
    case 'taskGroup': { const task = byId(entries); return task ? group(task.blockId) : null; }
    case 'week': return p.weeks[target.id] ?? null;
    case 'review': return p.reviews[target.id] ?? null;
    case 'context': return p.context;
    case 'routine': return byId(body.routines);
    case 'run': return body.runs.find(r => r.routineId === target.id && r.day === target.day) ?? null;
    case 'meal': return byId(body.meals);
    case 'mealGuess': return body.mealGuesses[target.id] ?? null;
    case 'mealSlot': return body.mealPlan.slots.find(s => s.slot === target.id) ?? null;
    case 'waterSettings': return body.water.settings;
    case 'waterSnooze': return body.water.snoozedUntil;
    case 'links': {
      const {collection, id} = target;
      if (collection === 'blocks') return {tasks: entries.filter(t => t.blockId === id), weeks: Object.entries(p.weeks).filter(([, w]) => w.focus.includes(id) || Object.hasOwn(w.verdicts, id))};
      const [child, key] = {projects: ['blocks', 'projectId'], goals: ['projects', 'goalId'], areas: ['goals', 'areaId']}[collection];
      return p[child].filter(row => row[key] === id);
    }
    default: throw new Error('Unknown planner target record.');
  }
}
