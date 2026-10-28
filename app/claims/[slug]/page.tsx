import { permanentRedirect } from "next/navigation";
/** /claims/[slug] is an alias: each fact-check's one canonical page is /c/[slug]. */
export default async function ClaimAlias({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/c/${encodeURIComponent(slug)}`);
}
