import { redirect } from "next/navigation";

// The root "/" redirects to the map screen, which is the default home.
// The manifest.json start_url is "/" so PWA launches here and immediately
// lands on the map — which is the intended experience.
export default function HomePage() {
  redirect("/map");
}
