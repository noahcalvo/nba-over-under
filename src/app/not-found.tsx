import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-4xl font-bold">League not found</h1>
      <p className="text-fog-300">
        Leagues live in server memory in this prototype, so a server restart clears them. Create a new one or open the
        demo league.
      </p>
      <Link href="/" className={buttonClasses("primary")}>
        Back to Courtline
      </Link>
    </main>
  );
}
