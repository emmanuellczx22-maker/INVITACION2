import { getStore } from "@netlify/blobs";

export const config = { path: "/api/*" };

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const isAdmin = (r) => { const p = Netlify.env.get("ADMIN_PASSWORD"); return !!p && r.headers.get("x-admin") === p; };

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  const fotos = getStore("fotos");
  const rsvps = getStore("rsvps");

  if (path === "/fotos" && req.method === "GET") {
    const { blobs } = await fotos.list();
    const keys = blobs.map((b) => b.key);
    const gal = keys.filter((k) => k !== "principal").sort();
    return J({ fotos: gal.map((k) => ({ id: k, url: "/api/foto?k=" + k })), principal: keys.includes("principal") });
  }

  if (path === "/foto") {
    if (req.method === "GET") {
      const d = await fotos.getWithMetadata(url.searchParams.get("k") || "", { type: "arrayBuffer" });
      if (!d) return J({ error: "no existe" }, 404);
      return new Response(d.data, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=60" } });
    }
    if (!isAdmin(req)) return J({ error: "no autorizado" }, 401);
    if (req.method === "POST") {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 5.5e6) return J({ error: "muy grande" }, 413);
      const key = url.searchParams.get("tipo") === "principal" ? "principal" : "g" + Date.now();
      await fotos.set(key, buf);
      return J({ ok: true, key });
    }
    if (req.method === "DELETE") {
      await fotos.delete(url.searchParams.get("k") || "");
      return J({ ok: true });
    }
  }

  if (path === "/rsvps") {
    if (req.method === "POST") {
      let b; try { b = await req.json(); } catch { return J({ error: "json" }, 400); }
      const familia = String(b.familia || "").trim().slice(0, 60);
      const personas = parseInt(b.personas, 10);
      if (!familia || !(personas > 0) || personas > 50) return J({ error: "datos" }, 400);
      const key = "r" + Date.now() + Math.random().toString(36).slice(2, 6);
      await rsvps.setJSON(key, { familia, personas, fecha: new Date().toISOString() });
      return J({ ok: true });
    }
    if (req.method === "GET") {
      if (!isAdmin(req)) return J({ error: "no autorizado" }, 401);
      const { blobs } = await rsvps.list();
      const items = await Promise.all(blobs.map((b) => rsvps.get(b.key, { type: "json" })));
      items.sort((a, b) => (a?.fecha || "") < (b?.fecha || "") ? -1 : 1);
      return J({ rsvps: items.filter(Boolean) });
    }
  }
  return J({ error: "no encontrado" }, 404);
};
