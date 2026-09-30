// Whether a page lets other sites embed it (the Iframe component's warning in the editor).
// A browser can't read another site's headers, so the editor asks Node-RED: it fetches the
// URL and reads X-Frame-Options and the CSP's frame-ancestors. Editor-only (admin, with the
// "flows.read" permission); http(s) URLs only; headers only (the body is not kept).

const TIMEOUT_MS = 6000;

/** { embeddable: true | false | null, reason, xfo, frameAncestors, status } from response headers. */
function judge(headers, pageOrigin, targetOrigin) {
    const xfo = String(headers.get("x-frame-options") || "").trim();
    const csp = String(headers.get("content-security-policy") || "");
    const m = csp.match(/frame-ancestors\s+([^;]*)/i);
    const fa = m ? m[1].trim() : "";
    const out = { xfo: xfo || null, frameAncestors: fa || null };
    // frame-ancestors wins over X-Frame-Options (browsers ignore XFO when it is set)
    if (fa) {
        const list = fa.split(/\s+/).filter(Boolean);
        if (list.indexOf("'none'") !== -1) return Object.assign(out, { embeddable: false, reason: "frame-ancestors 'none': it allows no site to embed it" });
        if (list.indexOf("*") !== -1) return Object.assign(out, { embeddable: true, reason: "" });
        const self = list.indexOf("'self'") !== -1 && pageOrigin && pageOrigin === targetOrigin;
        const listed = pageOrigin && list.some((s) => s.replace(/\/$/, "") === pageOrigin);
        if (self || listed) return Object.assign(out, { embeddable: true, reason: "" });
        return Object.assign(out, { embeddable: false, reason: "frame-ancestors " + fa + ": this page (" + (pageOrigin || "?") + ") is not in its list" });
    }
    const x = xfo.toUpperCase();
    if (x === "DENY") return Object.assign(out, { embeddable: false, reason: "X-Frame-Options: DENY — it allows no site to embed it" });
    if (x === "SAMEORIGIN") {
        const same = pageOrigin && pageOrigin === targetOrigin;
        return Object.assign(out, { embeddable: !!same, reason: same ? "" : "X-Frame-Options: SAMEORIGIN — only its own site (" + targetOrigin + ") may embed it" });
    }
    return Object.assign(out, { embeddable: true, reason: "" });
}

module.exports = function (RED, route) {
    if (!RED.httpAdmin) return;
    const perm = RED.auth && typeof RED.auth.needsPermission === "function" ? RED.auth.needsPermission("flows.read") : (req, res, next) => next();
    RED.httpAdmin.get(route, perm, async function (req, res) {
        let url;
        try { url = new URL(String(req.query.url || "")); } catch (e) { return res.json({ embeddable: null, reason: "not a full URL (a relative one is this server's: fine)" }); }
        if (url.protocol !== "http:" && url.protocol !== "https:") return res.json({ embeddable: null, reason: "only http(s) is checked" });
        const pageOrigin = String(req.query.from || "");
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        try {
            const r = await fetch(url.href, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (Nexa embed check)" } });
            // headers are all we need
            try { if (r.body && typeof r.body.cancel === "function") r.body.cancel(); } catch (e) { /* ignore */ }
            const finalOrigin = (() => { try { return new URL(r.url || url.href).origin; } catch (e) { return url.origin; } })();
            res.json(Object.assign({ status: r.status, url: r.url || url.href }, judge(r.headers, pageOrigin, finalOrigin)));
        } catch (e) {
            res.json({ embeddable: null, reason: "Node-RED could not reach it (" + (e && e.name === "AbortError" ? "timeout" : (e && e.message) || e) + ") — the browser may still can" });
        } finally {
            clearTimeout(timer);
        }
    });
};
module.exports.judge = judge;
