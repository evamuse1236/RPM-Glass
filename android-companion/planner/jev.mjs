/** AI helpers: Jev sorts the Inbox into existing Blocks (preview first), Purpose and Goal ideas. */
import {tasks} from '../planner-state.mjs';
import {planningRequest, readPlanningResponse, jevSortRequest, readJevSortResponse, jevFingerprint, JEV_SORT_POLICY}
  from '../planner-ai.mjs';
import {el, icon, button} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {userMessage} from '../user-message.mjs';

const TITLES = {sort: 'Sort with Jev', purpose: 'Purpose suggestion', ideas: 'Goal ideas'};

function showSortPreview(app, preview, body, actions, explanation = 'Proposed arrangement. Nothing has moved yet.') {
  body.replaceChildren(el('p', 'sheet-note', explanation));
  const byId = new Map(tasks(app.data()).map(task => [task.id, task]));
  const section = (title, purpose, ids, cls = '') => {
    const node = el('section', 'preview-block ' + cls);
    const head = el('div', 'preview-head');
    head.append(icon(cls ? 'inbox' : 'stacks'), el('h3', '', title));
    node.append(head);
    if (purpose) node.append(el('p', 'preview-purpose', purpose));
    for (const id of ids ?? []) node.append(el('p', 'preview-task', byId.get(id)?.title ?? 'Unavailable task'));
    body.append(node);
  };
  for (const block of preview.blocks) section(block.title, block.purpose, block.taskIds);
  if (preview.leftUnsorted?.length) section('Kept in Inbox', '', preview.leftUnsorted, 'unassigned');
  actions.replaceChildren(
    button('Dismiss', async () => {
      try {
        await app.api.sortPreview.dismiss(preview.id, {revision: preview.revision});
        app.closeSheet();
        app.notice('Suggestion dismissed. Your plan was not changed.');
      } catch (error) {
        app.notice(userMessage(error));
      }
    }, 'text-btn'),
    button('Apply arrangement', async () => {
      try {
        await app.api.sortPreview.accept(preview.id, {revision: preview.revision});
        app.closeSheet();
        app.goTab('blocks');
        app.notice('Arrangement applied', {undo: true});
      } catch (error) {
        app.notice(userMessage(error));
      }
    }, 'filled-btn'),
  );
}

function sortError(status) {
  if (status === 401) return 'OpenRouter rejected the connected key. Reconnect it in Settings.';
  if (status === 429) return 'Jev is temporarily rate-limited. Your plan is unchanged; try again later.';
  return 'Jev could not make a grouping. Your plan is unchanged.';
}

async function runSort(app, status, body, actions, startVersion) {
  const {api} = app;
  if (!api.sortPreview) throw new Error('Safe sorting previews are unavailable in this build.');
  const existing = await api.sortPreview.list();
  if (existing?.length) {
    showSortPreview(app, existing[0], body, actions, 'Review this saved suggestion. Nothing has moved yet.');
    return;
  }
  const candidates = jevSortRequest(app.data());
  if (!candidates.selectedTaskIds.length) {
    status.textContent = 'No Inbox tasks to arrange. You can move tasks by hand or capture something new.';
    return;
  }
  if (!candidates.candidateBlocks.length) {
    status.textContent = 'Create a Block first. Jev only matches tasks to Results you already named.';
    return;
  }
  status.textContent = 'Jev is matching tasks to your existing Blocks…';
  const evidenceFingerprint = await jevFingerprint(candidates.body);
  const response = await api.native('decision', {body: candidates.body});
  if (response.status < 200 || response.status >= 300) throw new Error(sortError(response.status));
  const result = readJevSortResponse(response.body, candidates);
  if (app.data().version !== startVersion) {
    throw new Error('Your plans changed while Jev was working. Ask again for a fresh suggestion.');
  }
  if (!body.isConnected) return;
  status.textContent = result.explanation;
  const id = globalThis.crypto?.randomUUID?.() ?? `sort-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const created = await api.sortPreview.create({
    id, selectedTaskIds: candidates.selectedTaskIds, blocks: result.blocks, leftUnsorted: result.leftUnsorted,
    existingOnly: true, sourceVersion: startVersion,
    decision: {policy: JEV_SORT_POLICY, evidenceFingerprint, model: response.body.model,
      provider: response.body.provider ?? null, answers: response.body.answers, usage: response.body.usage,
      outcome: 'preview'},
  });
  if (!body.isConnected) return;
  showSortPreview(app, created.preview, body, actions, result.explanation);
}

/** action: 'sort' | 'purpose' | 'ideas'. Suggestions never change the plan before you apply them. */
export async function aiAction(app, action, blockId = null) {
  const startVersion = app.data().version;
  const {body, actions} = openSheet(app, TITLES[action]);
  const status = el('p', 'sheet-note', 'Preparing a suggestion…');
  status.setAttribute('role', 'status');
  body.append(status);
  if (!app.api.getPhone().hasKey) {
    status.textContent = 'Connect your AI key in Settings to get suggestions. Your plans stay saved.';
    actions.append(button('Open Settings', () => app.openSettings('ai_connection'), 'filled-btn'));
    return;
  }
  try {
    if (action === 'sort') {
      await runSort(app, status, body, actions, startVersion);
      return;
    }
    const request = planningRequest(app.data(), action, blockId);
    const response = await app.api.native('model', {body: request});
    if (response.status < 200 || response.status >= 300) {
      throw new Error('The AI request failed. Check your connection and try again.');
    }
    const result = readPlanningResponse(response.body, action);
    if (app.data().version !== startVersion) {
      throw new Error('Your plans changed while the AI was working. Ask again for a fresh suggestion.');
    }
    if (!body.isConnected) return;
    status.textContent = result.text;
    if (action === 'purpose') {
      const block = app.p().blocks.find(b => b.id === blockId);
      actions.append(button('Use this Purpose', () => app.commit({type: 'saveEntity', collection: 'blocks', id: blockId,
        fields: {...block, purpose: result.text}}, {label: 'Purpose updated'}).catch(() => {}), 'filled-btn'));
    }
  } catch (error) {
    if (!body.isConnected) return;
    status.textContent = userMessage(error);
    status.className = 'sheet-error';
  }
}

export function examples(app) {
  const {body} = openSheet(app, 'Result, Purpose, Plan');
  body.append(el('p', 'sheet-note', 'Illustrations only. These are not saved goals or assumptions about you.'));
  const samples = [
    ['Explain a chapter clearly', 'Feel prepared to contribute', 'Read key sections · write three points · discuss one question'],
    ['Have the home ready for the week', 'Make everyday life easier', 'Buy essentials · prepare meals · clear the workspace'],
  ];
  for (const [result, purpose, plan] of samples) {
    const card = el('section', 'example-card');
    card.append(el('span', 'overline', 'Result'), el('h3', '', result), el('span', 'overline', 'Purpose'),
      el('p', '', purpose), el('span', 'overline', 'Plan'), el('p', 'quiet', plan));
    body.append(card);
  }
}
