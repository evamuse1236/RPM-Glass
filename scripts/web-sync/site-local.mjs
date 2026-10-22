#!/usr/bin/env node
import {createServer} from 'node:http';
import {Readable} from 'node:stream';

const {default: worker} = await import(new URL('../../web/dist-site/server/index.js', import.meta.url));
const env = {RPM_SYNC_SERVER: process.env.RPM_SYNC_SERVER, RPM_WEB_TOKEN: process.env.RPM_WEB_TOKEN};
const port = +(process.env.PORT ?? 5179);
createServer(async (req, res) => {
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
  const reply = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, {method: req.method, headers: req.headers, body, duplex: 'half'}), env);
  res.writeHead(reply.status, Object.fromEntries(reply.headers));
  res.end(Buffer.from(await reply.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Site Worker on http://127.0.0.1:${port} (key ${env.RPM_WEB_TOKEN ? 'set' : 'missing'})`));
