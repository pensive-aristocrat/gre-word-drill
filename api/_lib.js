const crypto = require("crypto");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let tcp = null;
async function tcpClient() {
  if (tcp) return tcp;
  const { createClient } = require("redis");
  const c = createClient({ url: process.env.REDIS_URL });
  c.on("error", () => {});
  tcp = c.connect().then(() => c).catch(e => { tcp = null; throw e; });
  return tcp;
}

async function redis(...cmd) {
  if (!URL_ || !TOKEN) {
    if (process.env.REDIS_URL) {
      const c = await tcpClient();
      return await c.sendCommand(cmd.map(String));
    }
    throw Object.assign(new Error("Database not connected. Add it in Vercel, then redeploy."), { status: 500 });
  }
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function userFromReq(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  return await redis("GET", "sess:" + t);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = { redis, hash, userFromReq, send, crypto };
