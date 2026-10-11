import { permanentRedirect } from "next/navigation";

/** /new-launch/ has no page of its own: the catalogue lives at /listings/. */
export default function NewLaunchIndex() {
  permanentRedirect("/listings/");
}
