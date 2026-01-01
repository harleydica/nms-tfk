import express from "express";
import * as cheerio from "cheerio";

const app = express();
app.use(express.static("public"));

const MIKROTIK_HOST = process.env.MIKROTIK_HOST || "http://192.168.20.1";
const MT_USER = process.env.MT_USER || "";
const MT_PASS = process.env.MT_PASS || "";

/**
 * Optional Basic Auth (kalau Mikrotik kamu pakai basic auth).
 * Kalau Mikrotik kamu pakai cookie/login form, lebih baik buat user/IP allow untuk akses graph.
 */
function authHeaders() {
  if (!MT_USER || !MT_PASS) return {};
  const b64 = Buffer.from(`${MT_USER}:${MT_PASS}`).toString("base64");
  return { Authorization: `Basic ${b64}` };
}

async function mtFetch(path, opts = {}) {
  const url = `${MIKROTIK_HOST}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MikroTik fetch failed ${res.status} ${res.statusText} :: ${url}\n${text.slice(0, 200)}`);
  }
  return res;
}

/** Parse angka statistik dari HTML graph page */
function parseStatsFromHtml(html) {
  const $ = cheerio.load(html);

  // Text full body (lebih stabil untuk regex)
  const bodyText = $("body").text().replace(/\r/g, "");

  // Helper: ambil blok text untuk sebuah section (Daily/Weekly/Monthly/Yearly)
  function extractSection(label) {
    // Mikrotik biasanya punya "Daily" Graph (5 Minute Average), dst.
    // Kita ambil chunk dari label sampai label berikutnya (atau akhir).
    const labels = ['"Daily" Graph', '"Weekly" Graph', '"Monthly" Graph', '"Yearly" Graph'];
    const start = bodyText.indexOf(label);
    if (start < 0) return "";

    const nextLabels = labels.filter(l => l !== label);
    let end = bodyText.length;
    for (const nl of nextLabels) {
      const idx = bodyText.indexOf(nl, start + label.length);
      if (idx > -1 && idx < end) end = idx;
    }
    return bodyText.slice(start, end);
  }

  // Helper: parse baris "Max In: ...; Average In: ...; Current In: ...;"
  function parseInOut(sectionText) {
    const cleaned = sectionText.replace(/\s+/g, " ");

    const inLine = cleaned.match(/Max In:\s*([^;]+);\s*Average In:\s*([^;]+);\s*Current In:\s*([^;]+);/i);
    const outLine = cleaned.match(/Max Out:\s*([^;]+);\s*Average Out:\s*([^;]+);\s*Current Out:\s*([^;]+);/i);

    return {
      in: inLine ? { max: inLine[1].trim(), avg: inLine[2].trim(), current: inLine[3].trim() } : null,
      out: outLine ? { max: outLine[1].trim(), avg: outLine[2].trim(), current: outLine[3].trim() } : null
    };
  }

  const daily = parseInOut(extractSection('"Daily" Graph'));
  const weekly = parseInOut(extractSection('"Weekly" Graph'));
  const monthly = parseInOut(extractSection('"Monthly" Graph'));
  const yearly = parseInOut(extractSection('"Yearly" Graph'));

  return { daily, weekly, monthly, yearly };
}

/**
 * API: ambil statistik (Max/Average/Current) dari halaman HTML mikrotik.
 * GET /api/iface/:iface/stats
 */
app.get("/api/iface/:iface/stats", async (req, res) => {
  try {
    const iface = req.params.iface;
    const r = await mtFetch(`/graphs/iface/${encodeURIComponent(iface)}/`);
    const html = await r.text();
    const stats = parseStatsFromHtml(html);
    res.json({ iface, ...stats });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * API: get client IP address
 * GET /api/ip
 */
app.get("/api/ip", (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.socket.remoteAddress || 
             req.ip;
  res.json({ ip: ip.replace('::ffff:', '') });
});

/**
 * API: proxy gambar graph (gif)
 * GET /api/iface/:iface/graph/:type  (type: daily|weekly|monthly|yearly)
 */
app.get("/api/iface/:iface/graph/:type", async (req, res) => {
  try {
    const { iface, type } = req.params;
    if (!["daily", "weekly", "monthly", "yearly"].includes(type)) {
      return res.status(400).send("Invalid type");
    }

    const r = await mtFetch(`/graphs/iface/${encodeURIComponent(iface)}/${type}.gif`);

    // forward content-type, cache-control
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/gif");
    res.setHeader("Cache-Control", "no-store");

    // stream
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(500).send(String(e.message || e));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NMS running: http://localhost:${PORT}`);
  console.log(`Using MikroTik: ${MIKROTIK_HOST}`);
});
