"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { authClient } from "./auth-client";

const FIELD =
  "h-10 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-fog-50 placeholder:text-fog-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Development-only email and password sign-in (the server turns it on with AUTH_DEV_LOGIN=1 outside production).
 * Signs in, and creates the account when this email has none yet.
 */
export function DevSignInForm({ next }: { next: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const signedIn = await authClient.signIn.email({ email, password });
      if (signedIn.error) {
        // Better Auth answers an unknown email and a wrong password the same way: try to create the account, and
        // if the email already exists the password was wrong.
        const created = await authClient.signUp.email({ name: name.trim() || email, email, password });
        if (created.error) {
          setError(
            created.error.code === "USER_ALREADY_EXISTS" ||
              created.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
              ? "That email exists with a different password."
              : (created.error.message ?? "Couldn't sign in."),
          );
          setPending(false);
          return;
        }
      }
      window.location.assign(next);
    } catch {
      setError("Couldn't sign in.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-fog-50">Development sign-in</h2>
      <label className="flex flex-col gap-1 text-sm text-fog-300">
        Name
        <input
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Only used for a new account"
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-fog-300">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-fog-300">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={FIELD}
        />
      </label>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>
        Sign in
      </Button>
    </form>
  );
}
