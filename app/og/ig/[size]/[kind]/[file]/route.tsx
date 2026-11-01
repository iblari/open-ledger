import { renderIg } from "@/lib/og-ig";

/**
 * GET /og/ig/{portrait|square}/{m|c|n}/{id}.png — Instagram-sized share cards
 * (1080×1350 and 1080×1080) for metrics, fact-checks and news stories.
 */
export const runtime = "nodejs";
export const revalidate = 600;

export async function GET(_req: Request, { params }: { params: Promise<{ size: string; kind: string; file: string }> }) {
  const { size, kind, file } = await params;
  return renderIg(kind, size, file);
}
