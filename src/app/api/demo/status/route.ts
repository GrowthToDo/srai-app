import { NextResponse } from "next/server";
import { getDemoResetEpoch } from "@/lib/demo/reset-demo";

export async function GET() {
  const demo = process.env.DEMO_MODE === "true";
  return NextResponse.json({
    demo,
    // Lets browsers detect a server reset and drop their stale local
    // onboarding flags (see DemoBanner). Null outside demo mode and before
    // the first reset.
    resetAt: demo ? getDemoResetEpoch() : null,
  });
}
