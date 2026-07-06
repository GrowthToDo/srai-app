import { NextResponse, type NextRequest } from "next/server";
import { resetDemoData } from "@/lib/demo/reset-demo";

let lastResetAt = 0; // single-process demo instance; module scope is sufficient

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const auth = request.headers.get("authorization");
  const secret = process.env.DEMO_RESET_SECRET;
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  const originHost = (() => {
    const o = request.headers.get("origin") ?? request.headers.get("referer");
    try {
      return o ? new URL(o).host : null;
    } catch {
      return null;
    }
  })();
  // Behind Railway's proxy, nextUrl.host is the container-internal host while
  // the browser's Origin carries the public domain — compare against the
  // proxy-provided x-forwarded-host too, or the banner's same-origin reset
  // 401s in production. (Spoofing x-forwarded-host only buys a demo reset.)
  const requestHosts = [
    request.nextUrl.host,
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ].filter(Boolean);
  const sameOrigin = !!originHost && requestHosts.includes(originHost);
  if (!bearerOk && !sameOrigin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (Date.now() - lastResetAt < 60_000) {
    return NextResponse.json({ error: "too many resets" }, { status: 429 });
  }
  lastResetAt = Date.now();
  await resetDemoData();
  return NextResponse.json({ ok: true });
}
