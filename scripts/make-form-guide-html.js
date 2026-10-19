'use strict';
// Turns docs/FORM.md and docs/FORM_COMPONENTS.md into pages you can open with a double click (docs/FORM.html, docs/FORM_COMPONENTS.html). The pictures stay in
// docs/images/form and are linked by their relative path, so open the page from the docs folder. The Markdown is the source; run this again after it changes.
//   node scripts/make-form-guide-html.js
// It uses `marked`, which the workspace already has for its own tools (it is not a dependency of this package).
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const DOCS = path.join(__dirname, '..', 'docs');
const PAGES = [['FORM', 'Nexa Form: what it can do, and a cookbook'], ['FORM_COMPONENTS', 'Form controls: every property, event and action']];

// the same ids GitHub gives a heading, so the links inside the Markdown keep working
const slug = (text) => String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

const CSS = `
:root { --bg: #fff; --fg: #161616; --muted: #525252; --line: #e0e0e0; --soft: #f4f4f4; --accent: #0f62fe; --code: #f4f4f4; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --fg: #f4f4f4; --muted: #c6c6c6; --line: #393939; --soft: #262626; --accent: #78a9ff; --code: #262626; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 96px; }
h1 { font-size: 2rem; margin: 0 0 16px; } h2 { font-size: 1.5rem; margin: 48px 0 12px; padding-top: 16px; border-top: 1px solid var(--line); } h3 { font-size: 1.2rem; margin: 36px 0 8px; } h4 { margin: 24px 0 6px; }
a { color: var(--accent); } p, li { max-width: 78ch; } td p, td li { max-width: none; }
img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; background: #fff; display: block; margin: 8px 0; }
td img, th img { margin: 0; }
p > em:only-child { color: var(--muted); display: block; margin-bottom: 8px; }
table { border-collapse: collapse; width: 100%; margin: 12px 0 20px; font-size: .94rem; }
th, td { border: 1px solid var(--line); padding: 8px 10px; vertical-align: top; text-align: left; }
th { background: var(--soft); }
code { background: var(--code); padding: 1px 5px; border-radius: 3px; font: .9em/1.4 "IBM Plex Mono", ui-monospace, Consolas, monospace; }
pre { background: var(--code); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; overflow: auto; }
pre code { background: none; padding: 0; font-size: .86rem; }
hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
nav.top { font-size: .9rem; margin-bottom: 12px; color: var(--muted); }
`;

function render(markdown, title, pageName) {
    marked.use({ renderer: { heading(text, level) { return '<h' + level + ' id="' + slug(text) + '">' + text + '</h' + level + '>\n'; } } });
    // a link to another .md of the guide becomes a link to its page
    const body = marked.parse(markdown, { gfm: true, mangle: false, headerIds: false })
        .replace(/href="(FORM|FORM_COMPONENTS)\.md/g, 'href="$1.html');
    const other = pageName === 'FORM' ? '<a href="FORM_COMPONENTS.html">Every property of every control</a>' : '<a href="FORM.html">The Form guide and cookbook</a>';
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title><style>' + CSS + '</style></head>\n' +
        '<body><main><nav class="top">Made from ' + pageName + '.md, with its pictures from images/form. ' + other + '.</nav>\n' + body + '</main></body></html>\n';
}

function build() {
    return PAGES.map(([name, title]) => ({ file: path.join(DOCS, name + '.html'), html: render(fs.readFileSync(path.join(DOCS, name + '.md'), 'utf8'), title, name) }));
}

if (require.main === module) {
    build().forEach((p) => { fs.writeFileSync(p.file, p.html); console.log(path.relative(process.cwd(), p.file) + ' (' + p.html.length + ' characters)'); });
}
module.exports = { build, render, slug };
