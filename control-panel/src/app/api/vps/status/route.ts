import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import * as os from "node:os";

export const runtime = "nodejs";

function toGiB(bytes: number) {
  return bytes / (1024 ** 3);
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(totalMem - freeMem, 0);
  const usedPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
  const [loadAverage1m] = os.loadavg();

  return NextResponse.json({
    hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage1m: Number(loadAverage1m.toFixed(2)),
    memory: {
      usedPercent,
      usedGb: Number(toGiB(usedMem).toFixed(1)),
      totalGb: Number(toGiB(totalMem).toFixed(1)),
    },
    timestamp: new Date().toISOString(),
  });
}
