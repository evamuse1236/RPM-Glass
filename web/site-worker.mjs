const SITE = 'Bearer site';
const PASS = ['Content-Type', 'ETag', 'Retry-After'];
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
const problem = (status, code, message) => json({error: {code, message}}, status);

/**
 * The ChatGPT Sites server for the planner. ChatGPT sign-in already limits the Site to its owner, so the Site holds
 * one browser key (env RPM_WEB_TOKEN) for the owner's phone and the page needs no link code.
 */
export function siteWorker(assets, fetchImpl = (...args) => fetch(...args)) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const keyed = !!(env.RPM_SYNC_SERVER && env.RPM_WEB_TOKEN);
      if (url.pathname === '/v1/site') return json({site: keyed});
      if (url.pathname.startsWith('/v1/')) {
        if (!env.RPM_SYNC_SERVER) return problem(503, 'not_configured', 'This site has no sync server set.');
        const auth = request.headers.get('Authorization'), headers = new Headers();
        for (const name of ['Content-Type', 'If-None-Match']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
        if (auth === SITE) {
          if (!keyed) return problem(401, 'unauthorized', 'This site has no key for your phone.');
          if (url.pathname === '/v1/web/session') return problem(403, 'forbidden', 'Remove this site from the phone, under Cloud, Linked browsers.');
          headers.set('Authorization', `Bearer ${env.RPM_WEB_TOKEN}`);
        } else if (auth) headers.set('Authorization', auth);
        const upstream = await fetchImpl(new URL(url.pathname + url.search, env.RPM_SYNC_SERVER), {method: request.method, headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text()});
        const out = new Headers({'Cache-Control': 'no-store'});
        for (const name of PASS) if (upstream.headers.has(name)) out.set(name, upstream.headers.get(name));
        return new Response(upstream.status === 304 ? null : upstream.body, {status: upstream.status, headers: out});
      }
      const file = assets[url.pathname === '/' ? '/index.html' : url.pathname];
      if (!file) return new Response('Not found', {status: 404});
      return new Response(file.body, {headers: {'Content-Type': file.type, 'Cache-Control': 'no-cache'}});
    },
  };
}
