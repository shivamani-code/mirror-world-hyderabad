export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname.startsWith('/c/')) url.pathname = '/raw/' + url.pathname.slice(3);
    const res = await env.ASSETS.fetch(new Request(url.toString(), request));
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) h.set(k, v);
    h.set('Cache-Control', 'public, max-age=604800');
    if (url.pathname.endsWith('.bin')) h.set('Content-Type', 'application/octet-stream');
    return new Response(res.body, { status: res.status, headers: h });
  }
};
