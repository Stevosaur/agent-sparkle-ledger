import { notFound, permanentRedirect } from "next/navigation";
import { isLaunchType, listingsHref } from "@/lib/launch-insights";

/** /new-launch/<type>/ redirects to the matching catalogue tab; unknown types 404. */
export default async function NewLaunchTypeIndex({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isLaunchType(type)) notFound();
  permanentRedirect(listingsHref({ type }));
}
