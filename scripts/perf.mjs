#!/usr/bin/env node
// Server response times for the league pages, as a logged-out browser sees them.
// Usage: node scripts/perf.mjs [base-url] [league-id] [runs]
//   default base https://nba-over-under-iota.vercel.app, league bgtpyh, 7 runs per request.
// For each page it times the HTML document (time to first byte and to the end of the stream) and the RSC payload a
// client navigation fetches (the whole tree, so layout work counts too), then prints medians and p90s.
// Compare runs before and after a change; production numbers vary by ±50 ms, so look at medians over several runs.

const base = (process.argv[2] ?? "https://nba-over-under-iota.vercel.app").replace(/\/$/, "");
const league = process.argv[3] ?? "bgtpyh";
const runs = Number(process.argv[4] ?? 7);

const pages = ["", "/rosters", "/settings", "/teams/ATL", "/teams/BOS"].map((suffix) => `/l/${league}${suffix}`);

async function time(path, headers) {
  const start = performance.now();
  const response = await fetch(base + path, { headers: { "cache-control": "no-cache", ...headers }, redirect: "manual" });
  const reader = response.body.getReader();
  let firstByte = null;
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    firstByte ??= performance.now() - start;
    bytes += value.byteLength;
  }
  return {
    status: response.status,
    ttfb: firstByte ?? performance.now() - start,
    total: performance.now() - start,
    bytes,
    region: response.headers.get("x-vercel-id")?.split("::").slice(0, -1).join("→") ?? "",
  };
}

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const ms = (value) => `${Math.round(value)}`.padStart(5);

console.log(`${base}  league ${league}  ${runs} runs (median / p90 ms)\n`);
console.log(`${"page".padEnd(26)} ${"doc ttfb".padStart(12)} ${"doc end".padStart(12)} ${"rsc end".padStart(12)}   doc KB  rsc KB  status`);
for (const path of pages) {
  // One warm-up request each, so a cold function start doesn't count.
  await time(path, {});
  await time(path, { RSC: "1" });
  const docs = [];
  const rscs = [];
  for (let i = 0; i < runs; i++) {
    docs.push(await time(path, {}));
    rscs.push(await time(path, { RSC: "1" }));
  }
  const pair = (list, key) => `${ms(quantile(list.map((r) => r[key]), 0.5))} /${ms(quantile(list.map((r) => r[key]), 0.9))}`;
  console.log(
    `${path.padEnd(26)} ${pair(docs, "ttfb")} ${pair(docs, "total")} ${pair(rscs, "total")}   ${(docs[0].bytes / 1024).toFixed(1).padStart(6)}  ${(rscs[0].bytes / 1024).toFixed(1).padStart(6)}  ${docs[0].status}/${rscs[0].status} ${docs[0].region}`,
  );
}
