// Nexa UI — embeds: an Iframe for another web page (a Grafana dashboard, a camera, a report).
// Every iframe attribute (loading eager / lazy, sandbox, allow, referrer policy…), URL
// parameters (bindable: a variable, a tag), a Grafana preset (kiosk, theme with the colour
// mode, time range, refresh, variables), and Logic both ways: On Load / On Message (a
// postMessage from the page) / On Error / On Timeout; actions Reload, Open URL, Send a message,
// Set parameters, Back, Forward.
import { html, css, nothing, theme } from "../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, BASE_CSS, UIElement, CSS_GROUP, part, radiusProp, icon, spinner, num, defineUI } from "./core.js";

export const CATEGORY_EMBED = "UI · Embed";
const CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };

// ---- the attributes -------------------------------------------------------------------------
const SANDBOX = [
    ["allow-scripts", "Run scripts"], ["allow-same-origin", "Same origin (its cookies, storage)"], ["allow-forms", "Submit forms"],
    ["allow-popups", "Open popups"], ["allow-popups-to-escape-sandbox", "Popups without the sandbox"], ["allow-modals", "alert / confirm dialogs"],
    ["allow-downloads", "Downloads"], ["allow-top-navigation", "Navigate this whole page"], ["allow-top-navigation-by-user-activation", "Navigate this page on a click"],
    ["allow-top-navigation-to-custom-protocols", "Open custom protocols"], ["allow-pointer-lock", "Pointer lock"], ["allow-presentation", "Presentation"],
    ["allow-orientation-lock", "Orientation lock"], ["allow-storage-access-by-user-activation", "Storage access on a click"]
];
const ALLOW = [
    ["fullscreen", "Fullscreen"], ["autoplay", "Autoplay"], ["clipboard-read", "Read the clipboard"], ["clipboard-write", "Write the clipboard"],
    ["camera", "Camera"], ["microphone", "Microphone"], ["geolocation", "Location"], ["display-capture", "Screen capture"],
    ["encrypted-media", "Encrypted media"], ["picture-in-picture", "Picture-in-picture"], ["web-share", "Share"], ["payment", "Payment"],
    ["accelerometer", "Accelerometer"], ["gyroscope", "Gyroscope"], ["usb", "USB"], ["serial", "Serial"], ["midi", "MIDI"]
];
const key = (prefix, name) => prefix + name.replace(/(^|-)([a-z])/g, (_m, _d, c) => c.toUpperCase());
const sandboxProps = {}, allowProps = {};
SANDBOX.forEach(([name, label]) => { sandboxProps[key("sb", name.replace(/^allow-/, ""))] = { type: "boolean", default: name === "allow-scripts" || name === "allow-same-origin", group: "Security", label: label + " (" + name + ")", visibleWhen: (p) => !!p.sandbox }; });
ALLOW.forEach(([name, label]) => { allowProps[key("al", name)] = { type: "boolean", default: name === "fullscreen", group: "Permissions", label: label + " (" + name + ")" }; });
const OPT = (list) => list.map((v) => (typeof v === "string" ? { value: v, label: v || "(the browser's default)" } : v));

const IFRAME_CSS = css`
    .wrap { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: var(--r); background: var(--frame-bg, transparent);
        box-shadow: inset 0 0 0 var(--frame-bw, 0px) var(--bd); }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: normal; }
    .veil { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
        background: var(--bg-subtle); color: var(--fg-muted); font-size: var(--fs-label); letter-spacing: 0.32px; text-align: center; padding: 16px; }
    .veil .url { font-family: var(--mono); color: var(--fg); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .veil .icon svg { width: 28px; height: 28px; }
    .veil.error { color: var(--err); }
    .veil.overlay { background: color-mix(in srgb, var(--bg) 70%, transparent); }
`;

function _copyYoutubeParams(fromUrl, toUrl) {
    const rawTime = fromUrl.searchParams.get("start") || fromUrl.searchParams.get("t");
    if (rawTime) {
        const m = String(rawTime).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
        let sec = parseInt(rawTime, 10);
        if (m && (m[1] || m[2] || m[3])) {
            sec = (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
        }
        if (!isNaN(sec) && sec > 0) toUrl.searchParams.set("start", String(sec));
    }
    ["autoplay", "loop", "playlist", "mute", "controls", "list"].forEach((k) => {
        if (fromUrl.searchParams.has(k)) toUrl.searchParams.set(k, fromUrl.searchParams.get(k));
    });
}

/** Converts standard URLs of popular services to their official embeddable format. */
export function toEmbedUrl(rawUrl, p) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    let src = rawUrl.trim();
    if (!src) return "";

    // 1. Custom converter template: e.g. "https://my-converter.com/?url={url}"
    if (p && p.converter && typeof p.converter === "string" && p.converter.trim()) {
        const tmpl = p.converter.trim();
        if (tmpl.indexOf("{url}") !== -1) return tmpl.replace(/\{url\}/g, encodeURIComponent(src));
        if (tmpl.indexOf("{rawUrl}") !== -1) return tmpl.replace(/\{rawUrl\}/g, src);
    }

    // 2. If autoEmbed is explicitly off, keep as is
    if (p && p.autoEmbed === false) return src;

    try {
        const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(src) && src.indexOf("//") !== 0;
        if (isRelative) return src;

        const u = new URL(src, "http://localhost/");
        const host = u.hostname.toLowerCase();
        const path = u.pathname;

        // YouTube: watch?v=, youtu.be/, /shorts/, /live/
        if (host === "youtu.be") {
            const id = path.replace(/^\//, "").split("/")[0];
            if (id) {
                const em = new URL("https://www.youtube.com/embed/" + id);
                _copyYoutubeParams(u, em);
                return em.href;
            }
        } else if (host.indexOf("youtube.com") !== -1) {
            let id = "";
            if (path.indexOf("/shorts/") === 0) id = path.slice(8).split("/")[0];
            else if (path.indexOf("/live/") === 0) id = path.slice(6).split("/")[0];
            else if (path.indexOf("/embed/") === 0) id = path.slice(7).split("/")[0];
            else if (u.searchParams.has("v")) id = u.searchParams.get("v");

            if (id) {
                const em = new URL("https://www.youtube.com/embed/" + id);
                _copyYoutubeParams(u, em);
                return em.href;
            }
        }

        // Vimeo: vimeo.com/123456789
        if (host.indexOf("vimeo.com") !== -1 && host.indexOf("player.vimeo.com") === -1) {
            const m = path.match(/\/(\d+)(?:[?#]|$)/);
            if (m && m[1]) {
                return "https://player.vimeo.com/video/" + m[1] + u.search + u.hash;
            }
        }

        // Google Docs / Sheets / Slides / Drive: /edit or /view -> /preview
        if (host === "docs.google.com" || host === "drive.google.com") {
            if (/\/(document|spreadsheets|presentation)\/d\/[^/]+/.test(path)) {
                const newPath = path.replace(/\/(edit|view|copy).*$/, "/preview");
                return u.origin + newPath + u.search + u.hash;
            }
            if (/\/file\/d\/[^/]+/.test(path)) {
                const newPath = path.replace(/\/(view|edit).*$/, "/preview");
                return u.origin + newPath + u.search + u.hash;
            }
        }

        // Figma: /file/, /design/, /proto/ -> https://www.figma.com/embed?embed_host=share&url=...
        if (host.indexOf("figma.com") !== -1 && (path.indexOf("/file/") === 0 || path.indexOf("/design/") === 0 || path.indexOf("/proto/") === 0)) {
            return "https://www.figma.com/embed?embed_host=share&url=" + encodeURIComponent(src);
        }

        // Loom: /share/ID -> /embed/ID
        if (host.indexOf("loom.com") !== -1 && path.indexOf("/share/") === 0) {
            const id = path.slice(7).split("/")[0];
            if (id) return u.origin + "/embed/" + id + u.search + u.hash;
        }

        // Spotify: /track/, /album/, /playlist/, /artist/, /episode/
        if (host === "open.spotify.com" && path.indexOf("/embed/") !== 0) {
            return "https://open.spotify.com/embed" + path + u.search + u.hash;
        }

        // CodePen: /pen/ID -> /embed/ID
        if (host.indexOf("codepen.io") !== -1 && path.indexOf("/pen/") !== -1) {
            return u.origin + path.replace("/pen/", "/embed/") + u.search + u.hash;
        }
    } catch (e) {
        // keep as is on URL parsing failure
    }

    return src;
}

/** The URL it loads: src + its parameters (a list, the Grafana preset, the ones set by Logic). */
export function buildEmbedUrl(p, extra, mode) {
    let src = String(p.src || "").trim();
    if (!src) return "";
    src = toEmbedUrl(src, p);
    let u;
    try { u = new URL(src, typeof location !== "undefined" ? location.href : "http://localhost/"); } catch (e) { return src; }
    // empty = leave the URL's own value alone; null (Set parameters from Logic) = remove it
    const set = (k, v) => {
        if (k === undefined || k === null || String(k) === "") return;
        if (v === null) u.searchParams.delete(String(k));
        else if (v !== undefined && v !== "") u.searchParams.set(String(k), String(v));
    };
    if (p.preset === "grafana") {
        if (p.gKiosk && p.gKiosk !== "off") { if (p.gKiosk === "full") u.searchParams.set("kiosk", ""); else set("kiosk", p.gKiosk); }
        const th = p.gTheme === "auto" ? (mode === "dark" ? "dark" : "light") : p.gTheme;
        if (th && th !== "none") set("theme", th);
        set("from", p.gFrom); set("to", p.gTo); set("refresh", p.gRefresh); set("orgId", p.gOrgId); set("timezone", p.gTimezone);
        (Array.isArray(p.gVars) ? p.gVars : []).forEach((v) => { if (v && v.name) set("var-" + v.name, v.value); });
    }
    (Array.isArray(p.params) ? p.params : []).forEach((q) => { if (q && q.key && q.enabled !== false) set(q.key, q.value); });
    Object.keys(extra || {}).forEach((k) => set(k, extra[k]));
    // a relative src stays relative (the page's own origin)
    return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.indexOf("//") === 0 ? u.href : u.pathname + u.search + u.hash;
}
// The editor asks Node-RED whether a page lets other sites embed it (a browser can't read
// another site's headers): X-Frame-Options / CSP frame-ancestors. One answer per URL.
const embedChecks = {};
function checkEmbed(url) {
    if (!/^https?:\/\//i.test(url)) return Promise.resolve(null);
    const key = url.replace(/[?#].*$/, "");
    if (!embedChecks[key]) {
        // nexa-lint-allow network: the plugin's own admin route (widgets/embed-check.js), editor only
        embedChecks[key] = fetch("nexa-component-ui-library/embed-check?url=" + encodeURIComponent(url) + "&from=" + encodeURIComponent(location.origin))
            .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
    return embedChecks[key];
}
function originOf(url) {
    try { return new URL(url, location.href).origin; } catch (e) { return ""; }
}

export const iframe = defineUI({
    id: PREFIX + "iframe", label: "Iframe", icon: "fa fa-window-restore", size: { w: 640, h: 360 },
    category: CATEGORY_EMBED, capabilities: CAPS, css: "",
    help: "Another web page in this one: a Grafana dashboard, a camera, a report. Its URL and parameters can be bound (a variable, a tag). Logic: On Load / On Message (the page's postMessage), and Update Component → Run: Reload / Open URL / Send a message / Set parameters.",
    properties: Object.assign({
        // Content
        src: { type: "string", default: "", group: "Content", label: "URL", placeholder: "https://grafana.local:3000/d/…", help: "Absolute (https://…) or on this server (/grafana/d/abc). Bind it to a variable to switch pages. The site must allow embedding: many public sites (grafana.com, google.com) forbid it — the editor tells you." },
        autoEmbed: { type: "boolean", default: true, group: "Content", label: "Auto-convert embed URL", help: "Converts YouTube, Vimeo, Google Docs/Sheets/Slides/Drive, Figma, Loom, Spotify, CodePen URLs to their official embed format." },
        converter: { type: "string", default: "", group: "Content", label: "Converter template", placeholder: "e.g. https://converter.local/?url={url}", help: "Optional wrapper/converter URL template. {url} is replaced with the encoded URL, or {rawUrl} for unencoded." },
        params: { type: "list", default: [], group: "Content", label: "URL parameters", help: "Added to the URL's query (bind a value: {var} / a tag). Off = left out.",
            item: { fields: { key: { type: "string", label: "Name", default: "" }, value: { type: "string", label: "Value", default: "" }, enabled: { type: "boolean", label: "On", default: true } } } },
        srcdoc: { type: "text", default: "", group: "Content", label: "HTML instead of a URL (srcdoc)", rows: 4, help: "When set, this HTML is shown instead of the URL." },
        title: { type: "string", default: "Embedded page", group: "Content", label: "Title (for screen readers)" },
        name: { type: "string", default: "", group: "Content", label: "Name (a link's target=\"…\")" },
        // Grafana
        preset: { type: "enum", default: "none", group: "Grafana", label: "Preset", style: "segmented", options: [{ value: "none", label: "None" }, { value: "grafana", label: "Grafana" }] },
        gKiosk: { type: "enum", default: "full", group: "Grafana", label: "Kiosk mode", options: [{ value: "off", label: "Off (menus)" }, { value: "tv", label: "TV (no side menu)" }, { value: "full", label: "Full (the panels only)" }], visibleWhen: (p) => p.preset === "grafana" },
        gTheme: { type: "enum", default: "auto", group: "Grafana", label: "Theme", options: [{ value: "auto", label: "Follow the app's colour mode" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "none", label: "Grafana's own" }], visibleWhen: (p) => p.preset === "grafana" },
        gFrom: { type: "string", default: "now-6h", group: "Grafana", label: "From", placeholder: "now-6h / 1695967200000", visibleWhen: (p) => p.preset === "grafana" },
        gTo: { type: "string", default: "now", group: "Grafana", label: "To", visibleWhen: (p) => p.preset === "grafana" },
        gRefresh: { type: "string", default: "30s", group: "Grafana", label: "Refresh", placeholder: "10s / 1m / (empty: off)", visibleWhen: (p) => p.preset === "grafana" },
        gOrgId: { type: "string", default: "", group: "Grafana", label: "Organisation (orgId)", visibleWhen: (p) => p.preset === "grafana" },
        gTimezone: { type: "string", default: "", group: "Grafana", label: "Time zone", placeholder: "browser / utc / Asia/Jakarta", visibleWhen: (p) => p.preset === "grafana" },
        gVars: { type: "list", default: [], group: "Grafana", label: "Dashboard variables (var-…)", visibleWhen: (p) => p.preset === "grafana",
            item: { row: true, fields: { name: { type: "string", label: "Variable", default: "" }, value: { type: "string", label: "Value", default: "" } } } },
        // Loading
        loading: { type: "enum", default: "lazy", group: "Loading", label: "Loading", style: "segmented", options: [{ value: "lazy", label: "Lazy (when near the view)" }, { value: "eager", label: "Eager (now)" }] },
        fetchpriority: { type: "enum", default: "auto", group: "Loading", label: "Fetch priority", style: "segmented", options: OPT(["auto", "high", "low"]) },
        showLoading: { type: "boolean", default: true, group: "Loading", label: "Show \"Loading…\" until it has loaded" },
        loadTimeout: { type: "number", default: 20, min: 0, unit: "s", group: "Loading", label: "Timeout (On Timeout; 0 = none)" },
        autoReload: { type: "number", default: 0, min: 0, unit: "s", group: "Loading", label: "Reload every (0 = never)" },
        live: { type: "boolean", default: true, group: "Loading", label: "Show the page on the canvas (editor)", help: "Off: a placeholder with its URL (a heavy page doesn't slow the editor)." },
        // Security
        sandbox: { type: "boolean", default: false, group: "Security", label: "Sandbox (only what is allowed below)", help: "On: the page is restricted; allow what it needs. Scripts + same origin together let a same-site page lift its own sandbox — only for pages you trust." }
    }, sandboxProps, {
        referrerpolicy: { type: "enum", default: "strict-origin-when-cross-origin", group: "Security", label: "Referrer policy",
            options: OPT(["no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"]) },
        csp: { type: "string", default: "", group: "Security", label: "Required CSP (csp, experimental)", placeholder: "e.g. script-src 'self'" },
        credentialless: { type: "boolean", default: false, group: "Security", label: "Credentialless (no cookies; Chromium)" },
        allowOrigins: { type: "string", default: "", group: "Messages", label: "Accept messages from", placeholder: "its URL's origin", help: "Origins (comma separated) whose postMessage fires On Message. Empty = only the embedded page's own origin; * = any (not recommended)." },
        targetOrigin: { type: "string", default: "", group: "Messages", label: "Send messages to origin", placeholder: "its URL's origin", help: "Send a message goes only to this origin. Empty = the embedded page's origin; * = any." }
    }, allowProps, {
        allowExtra: { type: "string", default: "", group: "Permissions", label: "More (allow=\"…\")", placeholder: "e.g. xr-spatial-tracking; hid" },
        // Style
        background: { type: "color", default: "", group: "Style", label: "Background (while it loads)" },
        borderWidth: { type: "number", default: 0, min: 0, unit: "px", group: "Style", label: "Border" },
        radius: radiusProp("md")
    }),
    events: {
        load: { label: "On Load (the page loaded, or navigated)", payload: { url: "string", count: "number" } },
        message: { label: "On Message (postMessage from the page)", payload: { data: "any", origin: "string" } },
        error: { label: "On Error", payload: { reason: "string" } },
        timeout: { label: "On Timeout (it did not load in time)", payload: { url: "string", seconds: "number" } }
    },
    actions: {
        reload: { label: "Reload" },
        navigate: { label: "Open URL", params: { url: { type: "string", label: "The URL" } } },
        postMessage: { label: "Send a message", params: { data: { type: "any", label: "The message (msg.payload)" }, targetOrigin: { type: "string", label: "Origin (optional)" } } },
        setParams: { label: "Set URL parameters", params: { params: { type: "object", label: "{ name: value } (null removes one)" } } },
        back: { label: "Back (same-origin pages)" },
        forward: { label: "Forward (same-origin pages)" }
    },
    parts: { frame: part("The frame", "frame"), veil: part("Loading / placeholder", "veil") },
    view: class extends UIElement {
        static styles = [BASE_CSS, IFRAME_CSS];
        loaded = false; count = 0; failed = ""; timedOut = false;
        extra = {};           // URL parameters set by Logic
        navigatedTo = "";      // a URL opened by Logic (until the URL prop changes)
        lastSrcProp = null;
        mounted() {
            // postMessage from the embedded page -> On Message (only its own window, allowed origins)
            this.listen(window, "message", (e) => {
                const f = this.frame();
                if (!f || e.source !== f.contentWindow) return;
                if (!this.accepts(e.origin)) return;
                this.fire("message", { data: e.data, origin: e.origin });
            });
        }
        unmounted() { clearTimeout(this.tmo); clearInterval(this.reloadTimer); }
        frame() { return this.renderRoot && this.renderRoot.querySelector("iframe"); }
        url() {
            if (this.navigatedTo) return toEmbedUrl(this.navigatedTo, this.p);
            return buildEmbedUrl(this.p, this.extra, theme.mode());
        }
        accepts(origin) {
            const list = String(this.p.allowOrigins || "").split(",").map((s) => s.trim()).filter(Boolean);
            if (list.indexOf("*") !== -1) return true;
            if (!list.length) list.push(originOf(this.url()));
            return list.indexOf(origin) !== -1;
        }
        propsChanged() {
            // a new URL prop: Logic's navigation / parameters no longer apply
            const sig = JSON.stringify([this.p.src, this.p.params, this.p.preset, this.p.autoEmbed, this.p.converter]);
            if (this.lastSrcProp !== null && sig !== this.lastSrcProp) { this.navigatedTo = ""; this.extra = {}; }
            this.lastSrcProp = sig;
            // Reload every N seconds
            const every = num(this.p.autoReload, 0);
            if (every !== this.everySec) {
                clearInterval(this.reloadTimer);   // its own name: this.every is the SDK's timer method
                this.everySec = every;
                this.reloadTimer = every > 0 && !this.isEditor ? this.every(every * 1000, () => this.reload()) : null;
            }
        }
        armTimeout() {
            clearTimeout(this.tmo);
            const s = num(this.p.loadTimeout, 0);
            if (s > 0 && !this.isEditor) this.tmo = setTimeout(() => { if (!this.loaded) { this.timedOut = true; this.requestUpdate(); this.fire("timeout", { url: this.url(), seconds: s }); } }, s * 1000);
        }
        onLoad() {
            clearTimeout(this.tmo);
            this.loaded = true; this.timedOut = false; this.failed = ""; this.count++;
            let at = this.url();
            try { const l = this.frame().contentWindow.location.href; if (l && l !== "about:blank") at = l; } catch (e) { /* another origin: its URL is ours to know only */ }
            this.requestUpdate();
            if (!this.isEditor) this.fire("load", { url: at, count: this.count });
        }
        // ---- Logic actions ----
        reload() {
            const f = this.frame();
            if (!f) return;
            this.loaded = false; this.armTimeout(); this.requestUpdate();
            try { f.contentWindow.location.reload(); return; } catch (e) { /* another origin */ }
            const u = f.getAttribute("src") || "";
            f.setAttribute("src", "about:blank");
            setTimeout(() => f.setAttribute("src", u), 0);
        }
        navigate(params) {
            const u = params && typeof params === "object" ? params.url : params;
            if (!u) { this.fire("error", { reason: "Open URL: no url" }); return; }
            this.navigatedTo = String(u); this.loaded = false; this.armTimeout(); this.requestUpdate();
        }
        postMessage(params) {
            const f = this.frame();
            if (!f || !f.contentWindow) { this.fire("error", { reason: "Send a message: not loaded" }); return; }
            const hasData = params && typeof params === "object" && "data" in params;
            const data = hasData ? params.data : params;
            const target = (params && typeof params === "object" && params.targetOrigin) || this.p.targetOrigin || originOf(this.url()) || "*";
            try { f.contentWindow.postMessage(data, target); } catch (e) { this.fire("error", { reason: String(e && e.message || e) }); }
        }
        setParams(params) {
            const obj = params && typeof params === "object" && params.params && typeof params.params === "object" ? params.params : params;
            if (!obj || typeof obj !== "object") return;
            this.extra = Object.assign({}, this.extra, obj);
            this.navigatedTo = ""; this.loaded = false; this.armTimeout(); this.requestUpdate();
        }
        history(dir) {
            try { this.frame().contentWindow.history[dir](); } catch (e) { this.fire("error", { reason: "Back / Forward work only on a page of this origin" }); }
        }
        back() { this.history("back"); }
        forward() { this.history("forward"); }

        editorCheck(url) {
            if (!this.isEditor || url === this.checkedUrl) return;
            this.checkedUrl = url;
            clearTimeout(this.checkTimer);
            this.checkTimer = setTimeout(() => checkEmbed(url).then((r) => { if (this.checkedUrl === url) { this.refused = r && r.embeddable === false ? r : null; this.requestUpdate(); } }), 400);
        }
        render() {
            const p = this.p, url = this.url();
            if (!p.srcdoc) this.editorCheck(url);
            // the editor: the page forbids embedding (it would show "refused to connect")
            const refused = this.isEditor && !p.srcdoc && this.refused && this.checkedUrl === url
                ? html`<div class="veil overlay error" part="veil">${icon("alert-triangle")}<div><b>This site does not allow embedding</b></div>
                    <div class="url">${url}</div><div>${this.refused.reason}</div>
                    <div>Use a page that allows it — e.g. your own Grafana with <span class="url">allow_embedding = true</span>, or a converter template.</div></div>` : nothing;
            this.style.setProperty("--frame-bg", p.background || "transparent");
            this.style.setProperty("--frame-bw", num(p.borderWidth, 0) + "px");
            if (this.isEditor && p.live === false) {
                return html`<div class="wrap" part="frame"><div class="veil" part="veil">${icon("external-link")}<div>Iframe</div><div class="url">${p.srcdoc ? "(its HTML)" : url || "(no URL)"}</div></div>${refused}</div>`;
            }
            if (!url && !p.srcdoc) return html`<div class="wrap" part="frame"><div class="veil" part="veil">${icon("external-link")}<div>Iframe</div><div>Set its URL in Properties → Content</div></div></div>`;
            if (url !== this.shownUrl) { this.shownUrl = url; this.loaded = false; this.armTimeout(); }
            const sandbox = p.sandbox ? SANDBOX.filter(([n]) => p[key("sb", n.replace(/^allow-/, ""))]).map(([n]) => n).join(" ") : null;
            const allow = ALLOW.filter(([n]) => p[key("al", n)]).map(([n]) => n).concat(String(p.allowExtra || "").split(";").map((s) => s.trim()).filter(Boolean)).join("; ");
            return html`<div class="wrap" part="frame">
                <iframe loading="${p.loading === "eager" ? "eager" : "lazy"}" fetchpriority="${p.fetchpriority || "auto"}"
                    title="${p.title || "Embedded page"}" name="${p.name || nothing}"
                    referrerpolicy="${p.referrerpolicy || nothing}" allow="${allow || nothing}"
                    sandbox="${sandbox === null ? nothing : sandbox}" csp="${p.csp || nothing}" ?credentialless="${!!p.credentialless}"
                    ?allowfullscreen="${!!p.alFullscreen}"
                    srcdoc="${p.srcdoc || nothing}" src="${p.srcdoc ? nothing : url}"
                    @load="${() => this.onLoad()}" @error="${() => { this.failed = "It could not be loaded."; this.fire("error", { reason: this.failed }); this.requestUpdate(); }}"></iframe>
                ${this.timedOut && !this.loaded ? html`<div class="veil overlay error" part="veil">${icon("alert-triangle")}<div>It did not load in time</div><div class="url">${url}</div></div>`
                    : p.showLoading !== false && !this.loaded && !refused ? html`<div class="veil overlay" part="veil">${spinner()}<div>Loading…</div></div>` : nothing}
                ${refused}
            </div>`;
        }
    }
});
