import fs from "node:fs";
import http from "node:http";
import os from "node:os";

const PORT = Number(process.env.PORT ?? "8787");
const AUTH_TOKEN = process.env.METRICS_API_TOKEN?.trim();
const CACHE_MS = Math.max(250, Number(process.env.METRICS_CACHE_MS ?? "2000"));

if (!AUTH_TOKEN) {
  throw new Error("Missing METRICS_API_TOKEN");
}

let cpuSnapshot = readCpuSnapshot();
let hostCpuUsedPercent = 0;

setInterval(() => {
  const next = readCpuSnapshot();

  if (!cpuSnapshot || !next) {
    cpuSnapshot = next;
    return;
  }

  const totalDelta = next.total - cpuSnapshot.total;
  const idleDelta = next.idle - cpuSnapshot.idle;

  if (totalDelta > 0) {
    hostCpuUsedPercent = ((totalDelta - idleDelta) / totalDelta) * 100;
  }

  cpuSnapshot = next;
}, 2000).unref();

let cachedPayload = null;
let cachedAt = 0;
let pendingCollection = null;

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 400, { error: "Missing request URL" });
    return;
  }

  const url = new URL(request.url, "http://localhost");

  if (url.pathname === "/health") {
    writeJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname !== "/api/v1/stats") {
    writeJson(response, 404, { error: "Not found" });
    return;
  }

  if (!isAuthorized(request)) {
    writeJson(response, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const payload = await getCachedPayload();
    writeJson(response, 200, payload);
  } catch (error) {
    writeJson(response, 500, {
      error: "Failed to collect metrics",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`vps-metrics-api listening on ${PORT}`);
});

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request) {
  const authHeader = request.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const tokenFromCustomHeader = Array.isArray(request.headers["x-metrics-token"])
    ? request.headers["x-metrics-token"][0]
    : request.headers["x-metrics-token"];

  return tokenFromHeader === AUTH_TOKEN || tokenFromCustomHeader === AUTH_TOKEN;
}

async function getCachedPayload() {
  const now = Date.now();

  if (cachedPayload && now - cachedAt <= CACHE_MS) {
    return cachedPayload;
  }

  if (pendingCollection) {
    return pendingCollection;
  }

  pendingCollection = collectMetrics()
    .then((payload) => {
      cachedPayload = payload;
      cachedAt = Date.now();
      return payload;
    })
    .finally(() => {
      pendingCollection = null;
    });

  return pendingCollection;
}

async function collectMetrics() {
  const [dockerInfo, containers] = await Promise.all([
    dockerRequest("/info"),
    dockerRequest("/containers/json?all=0"),
  ]);

  const containerStats = await Promise.all(
    containers.map((container) =>
      dockerRequest(`/containers/${encodeURIComponent(container.Id)}/stats?stream=0`)
    )
  );

  const metricsByContainer = containers
    .map((container, index) => {
      const stats = containerStats[index];
      return toContainerMetrics(container, stats, dockerInfo.NCPU ?? os.cpus().length);
    })
    .sort((a, b) => b.memory.usedBytes - a.memory.usedBytes);

  const hostMemory = readHostMemory();
  const totalMemoryBytes = hostMemory.totalBytes;
  const usedMemoryBytes = hostMemory.usedBytes;

  return {
    timestamp: new Date().toISOString(),
    hostname: dockerInfo.Name ?? os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
    cpu: {
      cores: dockerInfo.NCPU ?? os.cpus().length,
      loadAverage1m: Number(os.loadavg()[0].toFixed(2)),
      usedPercent: Number(hostCpuUsedPercent.toFixed(1)),
    },
    memory: {
      totalBytes: totalMemoryBytes,
      usedBytes: usedMemoryBytes,
      availableBytes: Math.max(totalMemoryBytes - usedMemoryBytes, 0),
      usedPercent:
        totalMemoryBytes > 0
          ? Number(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(1))
          : 0,
      totalGb: Number((totalMemoryBytes / 1024 ** 3).toFixed(1)),
      usedGb: Number((usedMemoryBytes / 1024 ** 3).toFixed(1)),
    },
    containers: metricsByContainer,
  };
}

function toContainerMetrics(container, stats, defaultCpus) {
  const memoryStats = stats.memory_stats ?? {};
  const memoryStatsDetails = memoryStats.stats ?? {};
  const memoryCache =
    memoryStatsDetails.total_inactive_file ??
    memoryStatsDetails.inactive_file ??
    memoryStatsDetails.cache ??
    0;
  const rawUsage = Number(memoryStats.usage ?? 0);
  const memoryUsageBytes = Math.max(rawUsage - Number(memoryCache), 0);
  const memoryLimitBytes = Number(memoryStats.limit ?? 0);

  const cpuStats = stats.cpu_stats ?? {};
  const prevCpuStats = stats.precpu_stats ?? {};
  const cpuDelta =
    Number(cpuStats.cpu_usage?.total_usage ?? 0) -
    Number(prevCpuStats.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    Number(cpuStats.system_cpu_usage ?? 0) - Number(prevCpuStats.system_cpu_usage ?? 0);
  const onlineCpus =
    Number(cpuStats.online_cpus) || cpuStats.cpu_usage?.percpu_usage?.length || defaultCpus || 1;
  const cpuPercent =
    cpuDelta > 0 && systemDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

  const networks = stats.networks ?? {};
  const networkTotals = Object.values(networks).reduce(
    (accumulator, network) => {
      accumulator.rxBytes += Number(network.rx_bytes ?? 0);
      accumulator.txBytes += Number(network.tx_bytes ?? 0);
      return accumulator;
    },
    { rxBytes: 0, txBytes: 0 }
  );

  return {
    id: container.Id,
    name: cleanContainerName(container.Names),
    image: container.Image,
    state: container.State,
    status: container.Status,
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memory: {
      usedBytes: memoryUsageBytes,
      limitBytes: memoryLimitBytes,
      usedPercent:
        memoryLimitBytes > 0
          ? Number(((memoryUsageBytes / memoryLimitBytes) * 100).toFixed(1))
          : 0,
    },
    network: {
      rxBytes: networkTotals.rxBytes,
      txBytes: networkTotals.txBytes,
    },
    pids: Number(stats.pids_stats?.current ?? 0),
  };
}

function cleanContainerName(names) {
  if (!Array.isArray(names) || names.length === 0) {
    return "unknown";
  }

  const name = names[0];
  return typeof name === "string" ? name.replace(/^\//, "") : "unknown";
}

function readCpuSnapshot() {
  try {
    const stat = fs.readFileSync("/proc/stat", "utf8");
    const cpuLine = stat.split("\n").find((line) => line.startsWith("cpu "));

    if (!cpuLine) {
      return null;
    }

    const values = cpuLine
      .trim()
      .split(/\s+/)
      .slice(1)
      .map((value) => Number(value));

    const idle = Number(values[3] ?? 0) + Number(values[4] ?? 0);
    const nonIdle =
      Number(values[0] ?? 0) +
      Number(values[1] ?? 0) +
      Number(values[2] ?? 0) +
      Number(values[5] ?? 0) +
      Number(values[6] ?? 0) +
      Number(values[7] ?? 0);

    return {
      total: idle + nonIdle,
      idle,
    };
  } catch {
    return null;
  }
}

function readHostMemory() {
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
    const totalKb = readMemInfoValue(meminfo, "MemTotal");
    const availableKb = readMemInfoValue(meminfo, "MemAvailable");

    if (!totalKb || !availableKb) {
      throw new Error("meminfo values missing");
    }

    const totalBytes = totalKb * 1024;
    const availableBytes = availableKb * 1024;

    return {
      totalBytes,
      usedBytes: Math.max(totalBytes - availableBytes, 0),
    };
  } catch {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();

    return {
      totalBytes,
      usedBytes: Math.max(totalBytes - freeBytes, 0),
    };
  }
}

function readMemInfoValue(meminfo, key) {
  const line = meminfo.split("\n").find((value) => value.startsWith(`${key}:`));

  if (!line) {
    return null;
  }

  const number = Number(line.replace(/[^0-9]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function dockerRequest(path) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        socketPath: "/var/run/docker.sock",
        method: "GET",
        path,
        headers: {
          Accept: "application/json",
        },
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          const statusCode = response.statusCode ?? 500;

          if (statusCode >= 400) {
            reject(new Error(`Docker API ${path} failed (${statusCode}): ${body}`));
            return;
          }

          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (error) {
            reject(
              new Error(
                `Invalid JSON from Docker API ${path}: ${error instanceof Error ? error.message : String(error)}`
              )
            );
          }
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.end();
  });
}
