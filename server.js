import express from "express";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.static("public"));
app.use(express.json());

// Configuration
const SNMP_HOST = process.env.SNMP_HOST || "172.17.100.1";
const SNMP_COMMUNITY = process.env.SNMP_COMMUNITY || "public";
const SNMP_VERSION = process.env.SNMP_VERSION || "2c";
const RRD_DIR = process.env.RRD_DIR || "./rrd";
const GRAPH_DIR = process.env.GRAPH_DIR || "./public/graphs";
const MONITOR_INTERFACES = (process.env.MONITOR_INTERFACES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const INTERFACE_DESCRIPTION_OVERRIDES = (process.env.INTERFACE_DESCRIPTION_OVERRIDES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .reduce((acc, item) => {
    const idx = item.indexOf(":");
    if (idx > 0) {
      const key = item.slice(0, idx).trim();
      const val = item.slice(idx + 1).trim();
      if (key && val) acc[key] = val;
    }
    return acc;
  }, {});

// Database Configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "nms",
  password: process.env.DB_PASS || "nms123",
  database: process.env.DB_NAME || "nms_db",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

// Create necessary directories
if (!fs.existsSync(RRD_DIR)) fs.mkdirSync(RRD_DIR, { recursive: true });
if (!fs.existsSync(GRAPH_DIR)) fs.mkdirSync(GRAPH_DIR, { recursive: true });

// ============================================
// SNMP HELPERS
// ============================================

/**
 * Jalankan SNMP command
 */
function snmpWalk(oid, callback) {
  const cmd = spawn("snmpwalk", [
    "-v", SNMP_VERSION,
    "-c", SNMP_COMMUNITY,
    SNMP_HOST,
    oid
  ]);

  let stdout = "";
  let stderr = "";

  cmd.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  cmd.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  cmd.on("close", (code) => {
    if (code === 0) {
      callback(null, stdout);
    } else {
      callback(new Error(stderr || `snmpwalk failed with code ${code}`), null);
    }
  });

  cmd.on("error", (err) => {
    callback(err, null);
  });
}

function snmpGet(oid, callback) {
  const cmd = spawn("snmpget", [
    "-v", SNMP_VERSION,
    "-c", SNMP_COMMUNITY,
    SNMP_HOST,
    oid
  ]);

  let stdout = "";
  let stderr = "";

  cmd.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  cmd.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  cmd.on("close", (code) => {
    if (code === 0) {
      callback(null, stdout);
    } else {
      callback(new Error(stderr || `snmpget failed with code ${code}`), null);
    }
  });

  cmd.on("error", (err) => {
    callback(err, null);
  });
}

function toSafeFilename(value) {
  return String(value || "iface").replace(/[^a-zA-Z0-9._-]/g, "_");
}

let collectorTimer = null;

function parseIfDescrLine(line) {
  const match = line.match(/\.(\d+)\s*=\s*STRING:?\s*"([^"]+)"/);
  if (!match) return null;
  return { ifIndex: match[1], ifName: match[2] };
}

function parseCounterValue(stdout) {
  const match = String(stdout || "").match(/=\s*(?:INTEGER|Counter32|Counter64):?\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function toDisplaySuffix(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "na";
}

const IF_TYPE_MAP = {
  1: "other",
  2: "regular1822",
  3: "hdh1822",
  4: "ddnx25",
  5: "rfc877x25",
  6: "ethernetCsmacd",
  7: "iso88023csmacd",
  8: "iso88024tokenBus",
  9: "iso88025tokenRing",
  10: "iso88026man",
  11: "starLan",
  12: "proteon10Mbit",
  13: "proteon80Mbit",
  14: "hyperchannel",
  15: "fddi",
  16: "lapb",
  17: "sdlc",
  18: "ds1",
  19: "e1",
  20: "basicISDN",
  21: "primaryISDN",
  22: "propPointToPointSerial",
  23: "ppp",
  24: "softwareLoopback",
  25: "eon",
  26: "ethernet3Mbit",
  27: "nsip",
  28: "slip",
  29: "ultra",
  30: "ds3",
  31: "sip",
  32: "frameRelay",
  33: "rs232",
  34: "para",
  35: "arcnet",
  36: "arcnetPlus",
  37: "atm",
  38: "miox25",
  39: "sonet",
  40: "x25ple",
  41: "iso88022llc",
  42: "localTalk",
  43: "smdsDxi",
  44: "frameRelayService",
  45: "v35",
  46: "hssi",
  47: "hippi",
  48: "qllc",
  49: "fastEthernet",
  50: "fddi",
  51: "lapd",
  52: "v37",
  53: "x121",
  54: "interleave",
  55: "remote",
  56: "ns",
  57: "taxiphone",
  58: "videotelephony",
  59: "pingGroup",
  60: "gramphone",
  61: "aal2",
  62: "twistedPairFastEthernet"
};

function getIfTypeDescription(ifTypeNum) {
  const num = parseInt(ifTypeNum, 10);
  const name = IF_TYPE_MAP[num] || "unknown";
  return `${name} (${num})`;
}

function getInterfacesFromSnmp(callback) {
  snmpWalk("1.3.6.1.2.1.2.2.1.2", (err, stdout) => {
    if (err || !stdout) {
      callback(err || new Error("No SNMP output"), []);
      return;
    }

    const interfaces = [];
    const lines = stdout.split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      const parsed = parseIfDescrLine(line);
      if (parsed) interfaces.push(parsed);
    });

    const byIndex = {};
    interfaces.forEach((itf) => {
      if (MONITOR_INTERFACES.length && !MONITOR_INTERFACES.includes(itf.ifName)) {
        return;
      }
      byIndex[itf.ifIndex] = {
        ifIndex: itf.ifIndex,
        ifName: itf.ifName,
        ifType: "-",
        interfaceDescription: itf.ifName,
        displayName: itf.ifName,
        speedrate: "-"
      };
    });

    // Fetch ifType
    snmpWalk("1.3.6.1.2.1.2.2.1.3", (typeErr, typeOut) => {
      if (!typeErr && typeOut) {
        typeOut
          .split("\n")
          .filter((l) => l.trim())
          .forEach((line) => {
            const m = line.match(/\.(\d+)\s*=\s*\w+:?\s*(\d+)/);
            if (m && byIndex[m[1]]) {
              byIndex[m[1]].ifType = getIfTypeDescription(m[2]);
            }
          });
      }

      // Optional ifAlias (interface-description)
      snmpWalk("1.3.6.1.2.1.31.1.1.1.18", (aliasErr, aliasOut) => {
        if (!aliasErr && aliasOut) {
          aliasOut
            .split("\n")
            .filter((l) => l.trim())
            .forEach((line) => {
              const m = line.match(/\.(\d+)\s*=\s*STRING:?\s*"([^"]*)"/);
              if (m && byIndex[m[1]] && m[2].trim()) {
                byIndex[m[1]].interfaceDescription = m[2].trim();
              }
            });
        }

        // ifSpeed
        snmpWalk("1.3.6.1.2.1.2.2.1.5", (speedErr, speedOut) => {
          if (!speedErr && speedOut) {
            speedOut
              .split("\n")
              .filter((l) => l.trim())
              .forEach((line) => {
                const m = line.match(/\.(\d+)\s*=\s*\w+:?\s*(\d+)/);
                if (m && byIndex[m[1]]) {
                  const bps = Number(m[2]);
                  if (Number.isFinite(bps) && bps > 0) {
                    byIndex[m[1]].speedrate = bps >= 1e9 ? `${(bps / 1e9).toFixed(1)} Gbps` : `${(bps / 1e6).toFixed(1)} Mbps`;
                  }
                }
              });
          }

          const finalInterfaces = Object.values(byIndex).map((itf) => {
            const override = INTERFACE_DESCRIPTION_OVERRIDES[itf.ifName];
            const finalDescription = override || itf.interfaceDescription || itf.ifName;
            return {
              ...itf,
              interfaceDescription: finalDescription,
              displayName: `${itf.ifName}-${toDisplaySuffix(finalDescription)}`
            };
          });

          callback(null, finalInterfaces);
        });
      });
    });
  });
}

function regenerateAllGraphs(callback) {
  const files = fs.readdirSync(RRD_DIR).filter((f) => f.endsWith(".rrd"));
  const timespans = ["1day", "7day", "30day", "1year"];
  let completed = 0;
  const total = files.length * timespans.length;

  if (total === 0) {
    console.log("⚠️  No RRD files found for cache generation");
    if (callback) callback();
    return;
  }

  console.log(`🔄 Starting cache generation for ${total} graphs...`);

  files.forEach((file) => {
    const rrdPath = path.join(RRD_DIR, file);
    const match = file.match(/(\d+)_/);
    if (!match) return;

    const ifIndex = match[1];
    const ifName = file.replace(/^\d+_/, "").replace(/\.rrd$/, "");

    timespans.forEach((timespan) => {
      const graphPath = path.join(GRAPH_DIR, `${ifIndex}_${timespan}.png`);
      generateGraph(rrdPath, graphPath, `Traffic: ${ifName}`, timespan, (err) => {
        completed++;
        if (err) {
          console.error(`❌ Error: ${ifIndex}_${timespan}: ${err.message}`);
        }
        if (completed === total && callback) {
          console.log(`✓ Cache generation complete (${completed}/${total})`);
          callback();
        }
      });
    });
  });
}

function runCollectorCycle() {
  const files = fs.readdirSync(RRD_DIR).filter((f) => f.endsWith(".rrd"));

  files.forEach((file) => {
    const rrdPath = path.join(RRD_DIR, file);
    const match = file.match(/(\d+)_/);
    if (!match) return;

    const ifIndex = match[1];

    snmpGet(`1.3.6.1.2.1.2.2.1.10.${ifIndex}`, (err1, stdout1) => {
      if (err1) return;

      snmpGet(`1.3.6.1.2.1.2.2.1.16.${ifIndex}`, (err2, stdout2) => {
        if (err2) return;

        snmpGet(`1.3.6.1.2.1.2.2.1.14.${ifIndex}`, (err3, stdout3) => {
          if (err3) return;

          snmpGet(`1.3.6.1.2.1.2.2.1.20.${ifIndex}`, (err4, stdout4) => {
            if (err4) return;

            const inOctets = parseCounterValue(stdout1);
            const outOctets = parseCounterValue(stdout2);
            const inErrors = parseCounterValue(stdout3);
            const outErrors = parseCounterValue(stdout4);

            updateRRD(rrdPath, inOctets, outOctets, inErrors, outErrors, (err) => {
              if (err) {
                console.error(`Error updating ${file}:`, err.message);
              }
            });
          });
        });
      });
    });
  });

  // Regenerate all graphs immediately after collector cycle
  regenerateAllGraphs();
}

function startCollector() {
  if (collectorTimer) return;
  runCollectorCycle();
  collectorTimer = setInterval(runCollectorCycle, 300000);
  console.log("Collector started (every 5 minutes)");
}

function bootstrapRrdFromSnmp() {
  getInterfacesFromSnmp((err, interfaces) => {
    if (err) {
      console.error("SNMP bootstrap failed:", err.message);
      return;
    }

    if (!interfaces.length) {
      console.log("No interfaces discovered from SNMP during bootstrap");
      return;
    }

    interfaces.forEach(({ ifIndex, ifName }) => {
      const rrdPath = path.join(RRD_DIR, `${ifIndex}_${toSafeFilename(ifName)}.rrd`);
      createRRD(rrdPath, () => {});
    });

    console.log(`Bootstrap completed: ${interfaces.length} interfaces prepared`);

    // Generate initial graph cache immediately (non-blocking)
    console.log("Generating initial graph cache...");
    regenerateAllGraphs(() => {
      console.log("✓ Initial graph cache ready");
    });
  });
}

// ============================================
// RRDtool HELPERS
// ============================================

/**
 * Buat RRD file untuk interface
 */
function createRRD(rrdPath, callback) {
  if (fs.existsSync(rrdPath)) {
    callback(null);
    return;
  }

  const cmd = spawn("rrdtool", [
    "create",
    rrdPath,
    "--step", "300", // 5 minutes
    `DS:InOctets:COUNTER:600:0:U`,
    `DS:OutOctets:COUNTER:600:0:U`,
    `DS:InErrors:COUNTER:600:0:U`,
    `DS:OutErrors:COUNTER:600:0:U`,
    `RRA:AVERAGE:0.5:1:2880`,      // 5min avg, 1 day
    `RRA:AVERAGE:0.5:12:2016`,     // 1hr avg, 1 month
    `RRA:AVERAGE:0.5:288:1440`,    // 1day avg, 1 year
    `RRA:MAX:0.5:1:2880`,          // 5min max, 1 day
    `RRA:MAX:0.5:12:2016`          // 1hr max, 1 month
  ]);

  let stderr = "";
  cmd.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  cmd.on("close", (code) => {
    if (code === 0) {
      callback(null);
    } else {
      callback(new Error(stderr || `rrdtool create failed`));
    }
  });

  cmd.on("error", (err) => {
    callback(err);
  });
}

/**
 * Update RRD dengan data SNMP
 */
function updateRRD(rrdPath, inOctets, outOctets, inErrors, outErrors, callback) {
  const timestamp = Math.floor(Date.now() / 1000);
  const rrdupdate = `${timestamp}:${inOctets}:${outOctets}:${inErrors}:${outErrors}`;

  const cmd = spawn("rrdtool", ["update", rrdPath, rrdupdate]);

  let stderr = "";
  cmd.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  cmd.on("close", (code) => {
    if (code === 0) {
      callback(null);
    } else {
      callback(new Error(stderr || `rrdtool update failed`));
    }
  });

  cmd.on("error", (err) => {
    callback(err);
  });
}

function computeRateSummary(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) {
    return { max: 0, avg: 0, current: 0 };
  }
  const max = Math.max(...clean);
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
  const current = clean[clean.length - 1];
  return { max, avg, current };
}

function fetchRrdStats(rrdPath, startArg, callback) {
  const cmd = spawn("rrdtool", ["fetch", rrdPath, "AVERAGE", "-s", startArg]);

  let stdout = "";
  let stderr = "";

  cmd.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  cmd.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  cmd.on("close", (code) => {
    if (code !== 0) {
      callback(new Error(stderr || "rrdtool fetch failed"));
      return;
    }

    const inBits = [];
    const outBits = [];

    stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+:/.test(l))
      .forEach((line) => {
        const parts = line.replace(/^\d+:\s*/, "").trim().split(/\s+/);
        const inOct = Number(parts[0]);
        const outOct = Number(parts[1]);
        if (Number.isFinite(inOct)) inBits.push(inOct * 8);
        if (Number.isFinite(outOct)) outBits.push(outOct * 8);
      });

    callback(null, {
      in: computeRateSummary(inBits),
      out: computeRateSummary(outBits)
    });
  });

  cmd.on("error", (err) => {
    callback(err);
  });
}

/**
 * Generate graph dari RRD
 */
function generateGraph(rrdPath, graphPath, title, timespan = "1day", callback) {
  const graphParams = {
    "1day": ["-s", "-1d", "-w", "430", "-h", "120"],
    "7day": ["-s", "-7d", "-w", "430", "-h", "120"],
    "30day": ["-s", "-30d", "-w", "430", "-h", "120"],
    "1year": ["-s", "-1y", "-w", "430", "-h", "120"]
  };

  const timeParams = graphParams[timespan] || graphParams["1day"];

  const cmd = spawn("rrdtool", [
    "graph",
    graphPath,
    ...timeParams,
    "--title", title,
    "--vertical-label", "Bits per second",
    `DEF:inOctets=${rrdPath}:InOctets:AVERAGE`,
    `DEF:outOctets=${rrdPath}:OutOctets:AVERAGE`,
    `CDEF:inBits=inOctets,8,*`,
    `CDEF:outBits=outOctets,8,*`,
    `AREA:inBits#00CC00:"In"`,
    `LINE1:outBits#0000FF:"Out"`
  ]);

  let stderr = "";
  cmd.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  cmd.on("close", (code) => {
    if (code === 0) {
      console.log(`📊 Generated: ${path.basename(graphPath)}`);
      callback(null);
    } else {
      callback(new Error(stderr || `rrdtool graph failed`));
    }
  });

  cmd.on("error", (err) => {
    callback(err);
  });
}

// ============================================
// DATABASE HELPERS
// ============================================

async function getDBConnection() {
  try {
    return await mysql.createConnection(DB_CONFIG);
  } catch (err) {
    console.error("DB Connection Error:", err.message);
    throw err;
  }
}

async function initDatabase() {
  try {
    const conn = await getDBConnection();
    
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS interfaces (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ifIndex INT UNIQUE NOT NULL,
        ifName VARCHAR(255) NOT NULL,
        ifType INT,
        ifMtu INT,
        ifSpeed BIGINT,
        ifDescription VARCHAR(500),
        ifAlias VARCHAR(500),
        enabled BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS traffic_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ifIndex INT NOT NULL,
        timestamp DATETIME NOT NULL,
        inOctets BIGINT,
        outOctets BIGINT,
        inErrors INT,
        outErrors INT,
        FOREIGN KEY (ifIndex) REFERENCES interfaces(ifIndex),
        INDEX idx_timestamp (timestamp),
        INDEX idx_ifIndex (ifIndex)
      )
    `);

    await conn.end();
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err.message);
  }
}

// ============================================
// API ENDPOINTS
// ============================================

app.get("/api/ip", (req, res) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0]) || req.socket.remoteAddress || req.ip || "Unknown";
  res.json({ ip: String(ip).replace("::ffff:", "") });
});

/**
 * GET /api/system/info
 * Ambil informasi sistem (sysUpTime, sysName, sysDescr)
 */
app.get("/api/system/info", (req, res) => {
  const oids = {
    sysDescr: "1.3.6.1.2.1.1.1.0",
    sysObjectID: "1.3.6.1.2.1.1.2.0",
    sysUpTime: "1.3.6.1.2.1.1.3.0",
    sysContact: "1.3.6.1.2.1.1.4.0",
    sysName: "1.3.6.1.2.1.1.5.0",
    sysLocation: "1.3.6.1.2.1.1.6.0"
  };

  const results = {};
  let completed = 0;

  Object.entries(oids).forEach(([key, oid]) => {
    snmpGet(oid, (err, stdout) => {
      if (!err && stdout) {
        const match = stdout.match(/=\s*(?:STRING|INTEGER|Timeticks):\s*(?:\((\d+)\)|"([^"]+)"|(\d+))/i);
        if (match) {
          results[key] = match[1] || match[2] || match[3] || "";
        }
      }
      completed++;
      if (completed === Object.keys(oids).length) {
        res.json(results);
      }
    });
  });
});

/**
 * GET /api/rrd/lastupdate/:iface
 * Ambil waktu update terakhir dari RRD file
 */
app.get("/api/rrd/lastupdate/:iface", (req, res) => {
  const { iface } = req.params;

  snmpWalk("1.3.6.1.2.1.2.2.1.2", (err, stdout) => {
    if (err || !stdout) {
      return res.json({ timestamp: null });
    }

    let ifIndex = null;
    const lines = stdout.split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      const match = line.match(/\.(\d+)\s*=\s*STRING:\s*"([^"]*)/);
      if (match && match[2] === iface) {
        ifIndex = match[1];
      }
    });

    if (!ifIndex) {
      return res.json({ timestamp: null });
    }

    const files = fs.readdirSync(RRD_DIR);
    const rrdFile = files.find((f) => f.startsWith(`${ifIndex}_`));

    if (!rrdFile) {
      return res.json({ timestamp: null });
    }

    const rrdPath = path.join(RRD_DIR, rrdFile);
    const cmd = spawn("rrdtool", ["lastupdate", rrdPath]);

    let stdout2 = "";
    cmd.stdout.on("data", (data) => {
      stdout2 += data.toString();
    });

    cmd.on("close", (code) => {
      if (code === 0) {
        // Parse lastupdate output: "1234567890: 123456 789012 ..."
        const match = stdout2.match(/(\d+):/);
        if (match) {
          const timestamp = parseInt(match[1], 10) * 1000; // convert to milliseconds
          res.json({ timestamp });
        } else {
          res.json({ timestamp: null });
        }
      } else {
        res.json({ timestamp: null });
      }
    });

    cmd.on("error", () => {
      res.json({ timestamp: null });
    });
  });
});

/**
 * GET /api/interfaces
 * Ambil semua interface dari router via SNMP
 */
app.get("/api/interfaces", (req, res) => {
  getInterfacesFromSnmp((err, interfaces) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(interfaces);
  });
});

/**
 * GET /api/interfaces/detailed
 * Ambil detail interface (dengan speed, type, dll)
 */
app.get("/api/interfaces/detailed", (req, res) => {
  getInterfacesFromSnmp((err, interfaces) => {
    if (err) {
      return res.json([]);
    }
    res.json(interfaces);
  });
});

/**
 * GET /api/interfaces/:ifIndex/status
 * Ambil status interface saat ini
 */
app.get("/api/interfaces/:ifIndex/status", (req, res) => {
  const { ifIndex } = req.params;

  // OID untuk InOctets, OutOctets, InErrors, OutErrors
  const oids = {
    inOctets: `1.3.6.1.2.1.2.2.1.10.${ifIndex}`,
    outOctets: `1.3.6.1.2.1.2.2.1.16.${ifIndex}`,
    inErrors: `1.3.6.1.2.1.2.2.1.14.${ifIndex}`,
    outErrors: `1.3.6.1.2.1.2.2.1.20.${ifIndex}`
  };

  const results = {};
  let completed = 0;

  Object.entries(oids).forEach(([key, oid]) => {
    snmpGet(oid, (err, stdout) => {
      if (!err && stdout) {
        results[key] = parseCounterValue(stdout);
      }
      completed++;
      if (completed === Object.keys(oids).length) {
        res.json(results);
      }
    });
  });
});

/**
 * POST /api/interfaces/:ifIndex/monitor
 * Enable monitoring untuk interface tertentu
 */
app.post("/api/interfaces/:ifIndex/monitor", (req, res) => {
  const { ifIndex } = req.params;
  const { ifName } = req.body;
  const safeIfName = toSafeFilename(ifName);
  const rrdPath = path.join(RRD_DIR, `${ifIndex}_${safeIfName}.rrd`);

  createRRD(rrdPath, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Save to database
    getDBConnection().then((conn) => {
      conn
        .execute(
          `INSERT INTO interfaces (ifIndex, ifName, enabled) 
           VALUES (?, ?, 1) 
           ON DUPLICATE KEY UPDATE enabled = 1`,
          [ifIndex, ifName]
        )
        .then(() => {
          conn.end();
          res.json({ success: true, message: `Monitoring enabled for ${ifName}` });
        })
        .catch((err) => {
          conn.end();
          res.status(500).json({ error: err.message });
        });
    });
  });
});

/**
 * GET /api/collectorstart
 * Jalankan data collection untuk semua interface yang di-monitor
 */
app.get("/api/collectorstart", (req, res) => {
  startCollector();
  runCollectorCycle();
  res.json({ message: "Collector running (every 5 minutes)." });
});

/**
 * GET /api/graph/:ifIndex/:timespan
 * Serve cached graph atau generate baru jika tidak ada
 */
app.get("/api/graph/:ifIndex/:timespan", (req, res) => {
  const { ifIndex, timespan } = req.params;
  const graphPath = path.join(GRAPH_DIR, `${ifIndex}_${timespan}.png`);

  // Serve cached graph jika ada
  if (fs.existsSync(graphPath)) {
    console.log(`⚡ Cache HIT: ${ifIndex}_${timespan}.png`);
    return res.sendFile(graphPath, { root: "." });
  }

  // Jika belum ada cache, generate sekarang
  console.log(`⏳ Cache MISS: Generating ${ifIndex}_${timespan}.png`);
  const files = fs.readdirSync(RRD_DIR);
  const rrdFile = files.find((f) => f.startsWith(`${ifIndex}_`));

  if (!rrdFile) {
    return res.status(404).json({ error: "RRD file not found" });
  }

  const rrdPath = path.join(RRD_DIR, rrdFile);
  const ifName = rrdFile.replace(/^\d+_/, "").replace(/\.rrd$/, "");

  generateGraph(rrdPath, graphPath, `Traffic: ${ifName}`, timespan, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.sendFile(graphPath, { root: "." });
  });
});

/**
 * GET /api/iface/:iface/stats
 * Compatibility endpoint untuk interface.html (lama)
 * Return stats per timespan
 */
app.get("/api/iface/:iface/stats", (req, res) => {
  const { iface } = req.params;
  let responseSent = false;

  // Cari ifIndex dari nama interface
  snmpWalk("1.3.6.1.2.1.2.2.1.2", (err, stdout) => {
    if (responseSent) return;
    
    if (err || !stdout) {
      responseSent = true;
      return res.json({
        daily: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } },
        weekly: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } },
        monthly: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } },
        yearly: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } }
      });
    }

    let ifIndex = null;
    const lines = stdout.split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      const match = line.match(/\.(\d+)\s*=\s*STRING:\s*"([^"]*)/);
      if (match && match[2] === iface) {
        ifIndex = match[1];
      }
    });

    if (!ifIndex) {
      responseSent = true;
      return res.json({
        daily: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } },
        weekly: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } },
        monthly: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } },
        yearly: { in: { max: "0", avg: "0", current: "0" }, out: { max: "0", avg: "0", current: "0" } }
      });
    }

    const files = fs.readdirSync(RRD_DIR);
    const rrdFile = files.find((f) => f.startsWith(`${ifIndex}_`));
    if (!rrdFile) {
      responseSent = true;
      return res.json({
        daily: { in: { max: 0, avg: 0, current: 0 }, out: { max: 0, avg: 0, current: 0 } },
        weekly: { in: { max: 0, avg: 0, current: 0 }, out: { max: 0, avg: 0, current: 0 } },
        monthly: { in: { max: 0, avg: 0, current: 0 }, out: { max: 0, avg: 0, current: 0 } },
        yearly: { in: { max: 0, avg: 0, current: 0 }, out: { max: 0, avg: 0, current: 0 } }
      });
    }

    const rrdPath = path.join(RRD_DIR, rrdFile);
    const spans = {
      daily: "-1d",
      weekly: "-7d",
      monthly: "-30d",
      yearly: "-1y"
    };

    const out = {};
    const keys = Object.keys(spans);
    let done = 0;

    keys.forEach((k) => {
      fetchRrdStats(rrdPath, spans[k], (fetchErr, stats) => {
        if (responseSent) return;
        out[k] = fetchErr
          ? { in: { max: 0, avg: 0, current: 0 }, out: { max: 0, avg: 0, current: 0 } }
          : stats;
        done++;
        if (done === keys.length) {
          responseSent = true;
          res.json(out);
        }
      });
    });
  });
});

/**
 * GET /api/iface/:iface/graph/:type
 * Serve cached graph atau generate baru (compatibility endpoint)
 */
app.get("/api/iface/:iface/graph/:type", (req, res) => {
  const { iface, type } = req.params;
  let responseSent = false;

  // Cari ifIndex dari nama interface
  snmpWalk("1.3.6.1.2.1.2.2.1.2", (err, stdout) => {
    if (responseSent) return;
    
    if (err || !stdout) {
      responseSent = true;
      return res.status(404).json({ error: "Interface not found" });
    }

    let ifIndex = null;
    const lines = stdout.split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      const match = line.match(/\.(\d+)\s*=\s*STRING:\s*"([^"]*)/);
      if (match && match[2] === iface) {
        ifIndex = match[1];
      }
    });

    if (!ifIndex) {
      responseSent = true;
      return res.status(404).json({ error: "Interface not found" });
    }

    const graphPath = path.join(GRAPH_DIR, `${ifIndex}_${type}.png`);

    // Serve cached graph jika ada
    if (fs.existsSync(graphPath)) {
      responseSent = true;
      return res.sendFile(graphPath, { root: "." });
    }

    // Jika belum ada cache, generate sekarang
    const files = fs.readdirSync(RRD_DIR);
    const rrdFile = files.find((f) => f.startsWith(`${ifIndex}_`));

    if (!rrdFile) {
      responseSent = true;
      return res.status(404).json({ error: "RRD file not found" });
    }

    const rrdPath = path.join(RRD_DIR, rrdFile);
    const timespan = type === "daily" ? "1day" : (type === "weekly" ? "7day" : (type === "monthly" ? "30day" : "1year"));

    generateGraph(rrdPath, graphPath, `Traffic: ${iface}`, timespan, (err) => {
      if (responseSent) return;
      
      if (err) {
        responseSent = true;
        return res.status(500).json({ error: err.message });
      }
      responseSent = true;
      res.sendFile(graphPath, { root: "." });
    });
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n📊 NMS Server started on http://localhost:${PORT}`);
  console.log(`📍 SNMP Host: ${SNMP_HOST}`);
  console.log(`📁 RRD Dir: ${RRD_DIR}`);
  console.log(`📁 Graph Dir: ${GRAPH_DIR}\n`);

  // Initialize database
  initDatabase();
  
  // Bootstrap and generate cache
  bootstrapRrdFromSnmp();
  startCollector();

  // Pre-generate graphs cache every 5 minutes
  setInterval(() => {
    console.log("Pre-generating graph cache...");
    regenerateAllGraphs(() => {
      console.log("Graph cache updated");
    });
  }, 300000); // 5 minutes
});

export default app;
