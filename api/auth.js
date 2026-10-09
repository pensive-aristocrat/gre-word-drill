const { redis, hash, send, crypto } = require("./_lib");
const SESSION_DAYS = 90;

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = body.action;

    if (action === "logout") {
      const h = req.headers.authorization || "";
      const t = h.startsWith("Bearer ") ? h.slice(7) : "";
      if (/^[a-f0-9]{64}$/.test(t)) await redis("DEL", "sess:" + t);
      return send(res, 200, { ok: true });
    }

    const id = String(body.id || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[a-z0-9_.-]{3,32}$/.test(id))
      return send(res, 400, { error: "ID must be 3–32 characters: letters, numbers, dot, dash or underscore." });
    if (password.length < 6 || password.length > 200)
      return send(res, 400, { error: "Password must be at least 6 characters." });

    // basic brute-force protection: 20 attempts per ID per 10 minutes
    const rl = "rl:" + id;
    const n = await redis("INCR", rl);
    if (n === 1) await redis("EXPIRE", rl, 600);
    if (n > 20) return send(res, 429, { error: "Too many attempts. Try again in 10 minutes." });

    if (action === "signup") {
      const salt = crypto.randomBytes(16).toString("hex");
      const ok = await redis("SET", "user:" + id, JSON.stringify({ salt, hash: hash(password, salt), created: Date.now() }), "NX");
      if (ok !== "OK") return send(res, 409, { error: "That ID is taken. Pick another, or sign in if it's yours." });
    } else if (action === "login") {
      const raw = await redis("GET", "user:" + id);
      const u = raw && JSON.parse(raw);
      const good = u && crypto.timingSafeEqual(Buffer.from(hash(password, u.salt), "hex"), Buffer.from(u.hash, "hex"));
      if (!good) return send(res, 401, { error: "Wrong ID or password." });
    } else {
      return send(res, 400, { error: "Unknown action" });
    }

    await redis("DEL", rl);
    const token = crypto.randomBytes(32).toString("hex");
    await redis("SET", "sess:" + token, id, "EX", SESSION_DAYS * 86400);
    return send(res, 200, { token, id });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Server error. Try again." });
  }
};
