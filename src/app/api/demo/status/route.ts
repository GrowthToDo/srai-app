import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ demo: process.env.DEMO_MODE === "true" });
}
