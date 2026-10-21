import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DevSignInForm } from "@/components/account/DevSignInForm";
import { GoogleSignInButton } from "@/components/account/GoogleSignInButton";
import { Logo } from "@/components/shell/Logo";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { safeNextPath } from "@/lib/access/next-path";
import { getAccount } from "@/server/account";
import { authAvailability } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-10 sm:py-16">
      <Logo />
      <Suspense fallback={<PageFallback label="Loading…" />}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SignInContent({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { next: rawNext } = await searchParams;
  // A repeated ?next= arrives as an array, which is not a path: it falls back to the home page.
  const next = safeNextPath(rawNext);
  if (await getAccount()) redirect(next);

  const { available, devLogin } = authAvailability();
  if (!available) {
    return (
      <Panel title="Sign in">
        <p role="status" className="text-fog-300">
          Sign-in isn&apos;t available right now.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Sign in" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
        <GoogleSignInButton next={next} />
      </Panel>
      {devLogin && (
        <Panel bodyClassName="p-4 sm:p-5">
          <DevSignInForm next={next} />
        </Panel>
      )}
    </div>
  );
}
