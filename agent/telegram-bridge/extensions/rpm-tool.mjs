import { readFile } from 'node:fs/promises';

const result = text => ({ content: [{ type: 'text', text }] });

export function createTodayTool(env = process.env, fetcher = fetch, timeoutMs = 15000) {
  return {
    name: 'rpm_today',
    label: 'RPM today',
    description: 'Read today’s RPM plan from the configured RPM API.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_toolCallId, _params, signal) {
      if (!env.RPM_API_URL) return result('RPM API not configured');
      try {
        const url = new URL(env.RPM_API_URL);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !env.RPM_TOKEN_FILE) return result('RPM API not configured');
        const token = (await readFile(env.RPM_TOKEN_FILE, 'utf8')).trim();
        if (!token || /\s/.test(token)) return result('RPM API not configured');
        const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
        const response = await fetcher(`${url.href.replace(/\/$/, '')}/v1/today`, { headers: { authorization: `Bearer ${token}` }, signal: combined });
        if (!response.ok) return result('RPM API request failed');
        return result(JSON.stringify(await response.json()));
      } catch { return result(signal?.aborted ? 'RPM API request cancelled' : 'RPM API request failed'); }
    },
  };
}

export default function rpmExtension(pi) { pi.registerTool(createTodayTool()); }
