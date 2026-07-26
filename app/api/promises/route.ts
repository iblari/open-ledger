import { NextResponse } from "next/server";
import { getPromises } from "@/lib/live-kv";

/** GET /api/promises — the public promise archive. */
export async function GET() {
  const file = await getPromises();
  return NextResponse.json(file ?? { generatedAt: null, method: "", promises: [] }, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
