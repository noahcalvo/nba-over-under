import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
