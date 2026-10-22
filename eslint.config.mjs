import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // /sign-in/start begins a Google sign-in on GET: reach it only through SignInLink (a plain <a>), never a prefetching
  // <Link>, or every prefetch would start a sign-in. (The demo block below sets its own restricted imports.)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/account/SignInLink.tsx", "src/app/account/page.tsx", "src/lib/access/next-path.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/access/next-path",
              importNames: ["startSignInHref"],
              message: "Use SignInLink: a prefetching <Link> to /sign-in/start would start a sign-in without a click.",
            },
          ],
        },
      ],
    },
  },
  // The guided demo runs in the browser only: it must never reach the server, the database or a real league.
  {
    files: ["src/lib/tutorial/**", "src/lib/tour/**", "src/components/tour/**", "src/components/tutorial/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server/*", "@/db/*", "@/app/*"], message: "The guided demo never reaches the server or the database." },
          ],
          paths: [
            { name: "@/components/draft/use-league-draft", message: "The guided demo drives the room with its own in-memory driver." },
          ],
        },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "The guided demo never calls the server." }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Other sessions' git worktrees.
    ".claude/**",
  ]),
]);

export default eslintConfig;
