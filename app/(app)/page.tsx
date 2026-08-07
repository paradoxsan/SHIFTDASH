import { redirect } from "next/navigation";

// "היום" is the home screen; `/` only exists to get you there. This lived in
// app/(dash)/page.tsx until that route group was deleted, which left the app
// with no root route at all — every post-login landing and every bare-domain
// visit 404'd. Keep it here, in the group that owns the shell.
export default function RootPage() {
  redirect("/today");
}
