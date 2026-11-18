const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");
const store = require("./store");

const PORT = Number(process.env.PORT) || 4177;
const ZONE = "Asia/Baghdad";
const OPEN_MINUTES = 8 * 60 + 30;
const CLOSE_MINUTES = 17 * 60;
const ENFORCE_HOURS = false;
const PUBLIC_DIR = path.join(__dirname, "public");

const FILES = {
  "/": "index.html",
  "/scan": "scan.html",
  "/styles.css": "styles.css",
  "/dashboard.js": "dashboard.js",
  "/scan.js": "scan.js",
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function baghdadMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour").value) % 24;
  const minute = Number(parts.find((part) => part.type === "minute").value);
  return hour * 60 + minute;
}

function isOpen(date = new Date()) {
  if (!ENFORCE_HOURS) return true;
  const minutes = baghdadMinutes(date);
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
}

function normalizeNumber(value) {
  const number = String(value ?? "").trim();
  if (!/^\d{1,12}$/.test(number)) return null;
  return number;
}

function normalizeName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return null;
  if (!/\p{L}/u.test(name)) return null;
  return name;
}

function addId(data, body, now = new Date()) {
  const number = normalizeNumber(body.number);
  if (!number) return { error: "Enter an ID number, digits only." };
  if (data.ids.some((item) => item.number === number)) {
    return { error: "That ID is already on the desk." };
  }

  let at = now.toISOString();
  if (body.at) {
    const parsed = new Date(body.at);
    if (Number.isNaN(parsed.getTime())) return { error: "Enter a valid date and time." };
    at = parsed.toISOString();
  }

  const available = !(body.available === false || body.available === "no");
  const item = { number, at, available, name: "", hold: null, lastPut: null };
  data.ids.push(item);
  return { item };
}

function setStatus(data, number, available) {
  const item = data.ids.find((entry) => entry.number === number);
  if (!item) return { error: "That ID is not on the desk." };
  item.available = Boolean(available);
  item.hold = null;
  if (item.available) item.name = "";
  return { item };
}

function removeId(data, number) {
  const index = data.ids.findIndex((entry) => entry.number === number);
  if (index < 0) return { error: "That ID is not on the desk." };
  data.ids.splice(index, 1);
  return { ok: true };
}

function collectNumbers(body) {
  const raw = Array.isArray(body.numbers) ? body.numbers : [body.number];
  const numbers = [];
  for (const value of raw) {
    if (value == null || String(value).trim() === "") continue;
    const number = normalizeNumber(value);
    if (!number) return { error: "Enter ID numbers, digits only." };
    if (!numbers.includes(number)) numbers.push(number);
  }
  if (!numbers.length) return { error: "Select at least one ID." };
  if (numbers.length > 10) return { error: "You can select 10 IDs at one time." };
  return { numbers };
}

function applyScan(data, body, now = new Date()) {
  const open = isOpen(now);
  if (!open) return { result: "connection", reason: "closed", open };

  const action = body.action === "put" ? "put" : body.action === "take" || body.action === "get" ? "take" : null;
  if (!action) return { error: "Choose Take or Put." };

  const name = normalizeName(body.name);
  if (!name) return { error: "Write a name." };

  const picked = collectNumbers(body);
  if (picked.error) return picked;

  const items = picked.numbers.map((number) => data.ids.find((entry) => entry.number === number));
  if (items.some((item) => !item)) return { error: "One of those numbers is not on the desk." };

  if (action === "take") {
    const blocked = items.filter((item) => item.hold || !item.available);
    if (blocked.length && blocked.length === items.length && blocked.every((item) => !item.available && !item.hold)) {
      return { result: "connection", reason: "absent", open, item: blocked[0], items: blocked };
    }
    if (blocked.length) {
      return { error: `Not available: ${blocked.map((item) => item.number).join(", ")}` };
    }
    const at = now.toISOString();
    for (const item of items) {
      item.available = false;
      item.name = name;
      item.hold = { at, name };
    }
    return { result: "assigned", action, open, items, item: items[0] };
  }

  const idle = items.filter((item) => !item.hold);
  if (idle.length) {
    return { error: `These IDs are not taken: ${idle.map((item) => item.number).join(", ")}` };
  }

  const at = now.toISOString();
  for (const item of items) {
    item.hold = null;
    item.available = true;
    item.name = "";
    item.lastPut = { at, name };
  }
  return { result: "assigned", action, open, items, item: items[0] };
}

function lanIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const family = net.family === 4 ? "IPv4" : net.family;
      if (family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "");
}

function publicBase(req) {
  const host = headerValue(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return `http://${lanIp()}:${PORT}`;
  }
  const forwarded = headerValue(req.headers["x-forwarded-proto"]).split(",")[0].trim();
  const proto = forwarded || "http";
  return `${proto}://${host}`;
}

function scanUrl(req) {
  return `${publicBase(req)}/scan`;
}

function present(data, req, now = new Date()) {
  const ids = data.ids
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.number).localeCompare(String(a.number)));
  return {
    open: isOpen(now),
    now: now.toISOString(),
    zone: ZONE,
    hours: { from: "8:30 AM", to: "5:00 PM" },
    scanUrl: scanUrl(req),
    ids,
  };
}

let chain = Promise.resolve();

async function writeUpdate(fn) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const loaded = await store.loadState();
    const result = fn(loaded.data);
    if (result.error || result.result === "connection") return result;
    const saved = await store.commit(loaded.data, loaded.etag);
    if (saved) return result;
  }
  return { error: "The desk was busy. Try again." };
}

function update(fn) {
  const run = chain.then(() => writeUpdate(fn));
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

function readBody(req) {
  if (req.body != null && req.body !== "") {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      try {
        const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
        return Promise.resolve(text.trim() ? JSON.parse(text) : {});
      } catch (error) {
        return Promise.reject(Object.assign(new SyntaxError("Invalid JSON"), { status: 400 }));
      }
    }
    if (typeof req.body === "object") return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(Object.assign(new SyntaxError("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function idFromPath(pathname) {
  return normalizeNumber(decodeURIComponent(pathname.slice("/api/ids/".length)));
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURI(url.pathname);

  if (req.method === "GET" && pathname === "/api/desk") {
    const loaded = await store.loadState();
    return sendJson(res, 200, present(loaded.data, req));
  }

  if (req.method === "GET" && pathname === "/qr.svg") {
    const svg = await QRCode.toString(scanUrl(req), {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#181818", light: "#ffffff" },
    });
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache",
    });
    res.end(svg);
    return;
  }

  if (req.method === "POST" && pathname === "/api/ids") {
    const body = await readBody(req);
    const result = await update((data) => addId(data, body));
    if (result.error) return sendJson(res, 400, result);
    return sendJson(res, 201, result);
  }

  if ((req.method === "PATCH" || req.method === "DELETE") && pathname.startsWith("/api/ids/")) {
    const number = idFromPath(pathname);
    if (!number) return sendJson(res, 400, { error: "Enter an ID number, digits only." });
    if (req.method === "DELETE") {
      const result = await update((data) => removeId(data, number));
      if (result.error) return sendJson(res, 404, result);
      return sendJson(res, 200, result);
    }
    const body = await readBody(req);
    const result = await update((data) => setStatus(data, number, body.available));
    if (result.error) return sendJson(res, 404, result);
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/scan") {
    const body = await readBody(req);
    const result = await update((data) => applyScan(data, body));
    if (result.error) return sendJson(res, 400, result);
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && FILES[pathname]) {
    return sendFile(res, path.join(PUBLIC_DIR, FILES[pathname]));
  }

  sendJson(res, 404, { error: "Not found" });
}

function run(req, res) {
  return handle(req, res).catch((error) => {
    if (res.headersSent) return;
    const status = error.status || 500;
    let message = "Something went wrong.";
    if (status === 400) message = "Could not read that request.";
    else if (status === 503 && error.message) message = error.message;
    sendJson(res, status, { error: message });
  });
}

function listen() {
  const server = http.createServer((req, res) => {
    run(req, res);
  });
  server.listen(PORT, "0.0.0.0", () => {
    const ip = lanIp();
    console.log(`Desk dashboard  http://localhost:${PORT}`);
    console.log(`Scan page       http://${ip}:${PORT}/scan`);
    console.log("QR connection   8:30 AM – 5:00 PM Baghdad time");
  });
  return server;
}

module.exports = {
  isOpen,
  addId,
  setStatus,
  removeId,
  applyScan,
  baghdadMinutes,
  normalizeNumber,
  normalizeName,
  run,
  publicBase,
};

if (require.main === module) listen();
