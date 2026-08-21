import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Fetches remote image URLs (e.g. short-lived Figma asset URLs) server-side and
// uploads them into the brand-assets storage bucket. Custom secret auth, so
// verify_jwt is disabled. Invoked from Postgres via pg_net.
const SECRET = "figma-import-2026";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "brand-assets";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const body = await req.json().catch(() => null);
    if (!body || body.secret !== SECRET) return json({ error: "unauthorized" }, 401);
    const assets = Array.isArray(body.assets) ? body.assets : [];
    const results: unknown[] = [];
    for (const a of assets) {
      try {
        const r = await fetch(a.url);
        if (!r.ok) {
          results.push({ path: a.path, ok: false, stage: "fetch", status: r.status });
          continue;
        }
        const ct = a.contentType || r.headers.get("content-type") || "application/octet-stream";
        const buf = new Uint8Array(await r.arrayBuffer());
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${a.path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": ct,
            "x-upsert": "true",
            "cache-control": "3600",
          },
          body: buf,
        });
        const ok = up.ok;
        results.push({
          path: a.path,
          ok,
          status: up.status,
          bytes: buf.length,
          contentType: ct,
          publicUrl: ok ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${a.path}` : null,
          error: ok ? null : (await up.text()).slice(0, 300),
        });
      } catch (e) {
        results.push({ path: a.path, ok: false, stage: "exception", error: String(e) });
      }
    }
    return json({ results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
