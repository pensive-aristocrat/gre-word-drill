const { redis, userFromReq, send } = require("./_lib");
const MAX = 400 * 1024;

module.exports = async (req, res) => {
  try {
    const id = await userFromReq(req);
    if (!id) return send(res, 401, { error: "Signed out. Sign in again." });

    if (req.method === "GET") {
      const raw = await redis("GET", "progress:" + id);
      return send(res, 200, { id, state: raw ? JSON.parse(raw) : null });
    }
    if (req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const st = body.state;
      if (!st || st.v !== 1 || typeof st.p !== "object") return send(res, 400, { error: "Bad progress data" });
      const s = JSON.stringify(st);
      if (s.length > MAX) return send(res, 413, { error: "Progress too large" });
      await redis("SET", "progress:" + id, s);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Server error. Try again." });
  }
};
