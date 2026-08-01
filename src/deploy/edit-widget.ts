export const EDIT_WIDGET_PATH_PREFIX = "/__claw__/";

export function editWidgetTag(portalUrl: string, slug: string): string {
  const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `\n<script src="/__claw__/widget.js" defer data-portal="${esc(portalUrl)}" data-slug="${esc(slug)}"></script>`;
}

export const EDIT_WIDGET_JS = `(() => {
  const script = document.currentScript;
  if (!script || window.__clawEditWidget) return;
  window.__clawEditWidget = true;
  const portal = script.dataset.portal || "";
  const slug = script.dataset.slug || "";
  if (!portal || !slug) return;

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = \`
    .bubble { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; width: 48px; height: 48px;
      border-radius: 50%; border: none; cursor: pointer; background: #111; color: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,.28); display: grid; place-items: center; font-size: 21px;
      transition: transform .15s ease; }
    .bubble:hover { transform: scale(1.08); }
    .panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 92vw); z-index: 2147483647;
      background: #fff; box-shadow: -8px 0 28px rgba(0,0,0,.22); display: none; flex-direction: column; }
    .panel.open { display: flex; }
    .bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px;
      background: #111; color: #fff; font: 13px/1.4 system-ui, sans-serif; }
    .bar button { background: none; border: none; color: #fff; font-size: 16px; cursor: pointer; }
    iframe { border: 0; flex: 1; width: 100%; }
    .reload { position: fixed; right: 84px; bottom: 28px; z-index: 2147483646; display: none;
      background: #111; color: #fff; border: none; border-radius: 8px; padding: 8px 12px;
      font: 13px system-ui, sans-serif; cursor: pointer; }
    .reload.show { display: block; }
  \`;
  const bubble = document.createElement("button");
  bubble.className = "bubble";
  bubble.type = "button";
  bubble.title = "Edit this app";
  bubble.setAttribute("aria-label", "Edit this app");
  bubble.textContent = "\\u270E";
  const panel = document.createElement("div");
  panel.className = "panel";
  const bar = document.createElement("div");
  bar.className = "bar";
  const title = document.createElement("span");
  title.textContent = "Editing " + slug;
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Close editor");
  close.textContent = "\\u2715";
  bar.append(title, close);
  panel.append(bar);
  const reload = document.createElement("button");
  reload.className = "reload";
  reload.type = "button";
  reload.textContent = "App updated \\u21BB reload";
  root.append(style, bubble, panel, reload);

  let frame = null;
  let baseVersion = null;
  let timer = null;

  const fetchVersion = async () => {
    try {
      const r = await fetch("/__claw__/version", { cache: "no-store" });
      if (!r.ok) return null;
      const d = await r.json();
      return typeof d.version === "number" ? d.version : null;
    } catch {
      return null;
    }
  };

  const poll = async () => {
    const v = await fetchVersion();
    if (v === null) return;
    if (baseVersion === null) baseVersion = v;
    else if (v !== baseVersion) reload.classList.add("show");
  };

  const open = () => {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.src = portal.replace(/\\/$/, "") + "/app-edit?slug=" + encodeURIComponent(slug) + "&embed=1";
      panel.append(frame);
    }
    panel.classList.add("open");
    bubble.style.display = "none";
    void poll();
    if (!timer) timer = setInterval(poll, 4000);
  };
  const shut = () => {
    panel.classList.remove("open");
    bubble.style.display = "";
    if (timer) { clearInterval(timer); timer = null; }
  };
  bubble.addEventListener("click", open);
  close.addEventListener("click", shut);
  reload.addEventListener("click", () => location.reload());

  const mount = () => document.body && document.body.append(host);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
`;
