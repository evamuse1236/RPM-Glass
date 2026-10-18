import { appendFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const record = event => appendFileSync(process.env.FAKE_PI_AUDIT, `${JSON.stringify({ ...event, pid: process.pid, time: Date.now() })}\n`);
const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
record({ type: 'start', hasKey: Boolean(process.env.ANTHROPIC_API_KEY), rpmTokenFile: process.env.RPM_TOKEN_FILE });
process.stderr.write(`Provider diagnostic ${process.env.ANTHROPIC_API_KEY}\n`);
let last = 'STALE PREVIOUS REPLY';
let busy = false;
let ignoreEnd = false;
const decoder = new StringDecoder('utf8');
let buffer = '';

function receive(command) {
  if (command.type === 'get_last_assistant_text') {
    record({ type: 'lookup', busy });
    emit({ id: 'unrelated-id', type: 'response', command: command.type, success: true, data: { text: 'WRONG RESPONSE' } });
    emit({ id: command.id, type: 'response', command: command.type, success: true, data: { text: last } });
    return;
  }
  if (command.type !== 'prompt') return;
  record({ type: 'prompt', message: command.message, busy });
  if (busy) { emit({ id: command.id, type: 'response', command: 'prompt', success: false }); return; }
  const prompt = command.message;
  if (prompt === 'handled') {
    emit({ id: command.id, type: 'response', command: 'prompt', success: true, data: { disposition: 'handled' } });
    return;
  }
  busy = true;
  const finish = () => {
    if (prompt !== 'no-assistant') {
      const failed = prompt === 'provider-error' || prompt === 'provider-aborted';
      if (prompt === 'retry-success') emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: process.env.ANTHROPIC_API_KEY } });
      last = prompt === 'long' ? `${'x'.repeat(3999)}😀${'y'.repeat(4001)}` : prompt === 'unicode' ? 'First\u2028second\u2029third 😀' : `Reply to ${prompt}`;
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: failed ? (prompt === 'provider-aborted' ? 'aborted' : 'error') : 'stop', content: [{ type: 'text', text: last }] } });
      if (failed) last = 'STALE PREVIOUS REPLY';
    }
    busy = false;
    emit({ type: 'agent_settled' });
  };
  if (prompt === 'immediate-settled') finish();
  emit({ id: command.id, type: 'response', command: 'prompt', success: true, ...(prompt === 'old-ack' ? {} : { data: { disposition: 'started' } }) });
  if (prompt === 'crash') return setTimeout(() => process.exit(7), 10);
  if (prompt === 'hang' || prompt === 'shutdown-hang') { ignoreEnd = true; setInterval(() => {}, 1000); return; }
  emit({ type: 'agent_end' });
  if (prompt !== 'immediate-settled') setTimeout(finish, prompt === 'delayed' ? 120 : 8);
}

process.stdin.on('data', data => {
  buffer += decoder.write(data);
  let end;
  while ((end = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (line) receive(JSON.parse(line));
  }
});
process.stdin.on('end', () => { record({ type: 'stdin-end' }); if (!ignoreEnd) process.exit(0); });
