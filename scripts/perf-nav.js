// Client-navigation timer. Paste into the page (browser pane `javascript_tool`) after it has loaded.
// Then navigate with REAL clicks (the `computer` tool) or `window.__perfNav.push(path)`; read `window.__perfNav.log`.
// Synthetic `element.click()` on a <Link> can turn into a full page load here, so don't use it.
// Per navigation it logs when the URL changed, when the new page's <h1> was visible ("header") and when nothing in
// <main> was still loading ("ready": no visible [aria-busy=true] or [role=status]). Hidden routes kept by the router
// (React Activity) are ignored by checking visibility.
(() => {
  const visible = (el) => el.checkVisibility?.() ?? el.offsetParent !== null;
  const heading = () => [...document.querySelectorAll("main h1")].find(visible)?.textContent?.trim() ?? null;
  const loading = () => [...document.querySelectorAll("main [aria-busy=true], main [role=status]")].some(visible);
  const state = { log: [], current: null };
  const start = (label) => {
    finish("interrupted");
    const from = heading();
    state.current = { label, t0: performance.now(), from, url: null, header: null, ready: null };
  };
  function finish(reason) {
    const c = state.current;
    if (!c) return;
    state.log.push({ label: c.label, url: c.url, header: c.header, ready: c.ready, ...(reason ? { reason } : {}) });
    state.current = null;
  }
  const check = () => {
    const c = state.current;
    if (!c) return;
    const now = Math.round(performance.now() - c.t0);
    if (c.url === null && location.pathname !== c.startPath) c.url = now;
    const h = heading();
    if (c.header === null && c.url !== null && h && (h !== c.from || c.sameHeading)) c.header = now;
    if (c.header !== null && !loading()) {
      c.ready = now;
      finish();
    }
  };
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      start(link.getAttribute("href"));
      state.current.startPath = location.pathname;
      state.current.sameHeading = false;
    },
    true,
  );
  new MutationObserver(check).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-busy"],
  });
  setInterval(check, 16);
  window.__perfNav = {
    log: state.log,
    /** Programmatic navigation, e.g. what the team <select> does. `sameHeading` when the h1 won't change. */
    push(path, { sameHeading = false } = {}) {
      start(path);
      state.current.startPath = location.pathname;
      state.current.sameHeading = sameHeading;
      window.next.router.push(path);
    },
    table: () => state.log.map((e) => `${e.label}  url ${e.url}ms  header ${e.header}ms  ready ${e.ready}ms${e.reason ? ` (${e.reason})` : ""}`),
  };
  return "perf-nav ready";
})();
