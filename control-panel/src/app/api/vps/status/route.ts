import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = process.env.VPS_METRICS_URL?.trim();
  const token = process.env.VPS_METRICS_TOKEN?.trim();

  if (!endpoint || !token) {
    return NextResponse.json(
      {
        error:
          "Missing VPS metrics configuration. Set VPS_METRICS_URL and VPS_METRICS_TOKEN.",
      },
      { status: 500 }
    );
  }

  const timeoutMs = Number(process.env.VPS_METRICS_TIMEOUT_MS ?? "6000");
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 6000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        {
          error: "Failed to fetch VPS metrics",
          detail,
        },
        { status: 502 }
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "VPS metrics endpoint unreachable",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
