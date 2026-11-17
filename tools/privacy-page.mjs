#!/usr/bin/env node
// Writes the website's copy of the privacy policy, docs/privacy.html, from PRIVACY.md.
// The stores link to the website's copy: GitHub answers 503 to the Chrome Web Store's
// fetch of a file page (github.com/.../blob/...), GitHub Pages doesn't.
//
//   node tools/privacy-page.mjs     after each change to PRIVACY.md
//
// tests/tools.test.js checks that docs/privacy.html is what this makes of PRIVACY.md.
// It reads only the Markdown PRIVACY.md uses: # and ## headings, paragraphs, "- " lists,
// one table, **bold**, *italic*, `code` and bare https addresses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One line or paragraph of text: code first (nothing inside it is read), then links,
// bold and italic
export function inline(text) {
  return text.split(/(`[^`]+`)/).map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${escape(part.slice(1, -1))}</code>`;
    return escape(part)
      .replace(/https:\/\/[^\s)<]+/g, (url) => `<a href="${url}">${url}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }).join('');
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

// The policy's body as HTML, block by block
export function policyHtml(markdown) {
  const blocks = markdown.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split('\n');
    if (/^# /.test(block)) return `<h1>${inline(block.slice(2))}</h1>`;
    if (/^## /.test(block)) return `<h2>${inline(block.slice(3))}</h2>`;
    if (/^\|/.test(block)) {
      const [head, , ...rows] = lines;
      const th = cells(head).map((c) => `<th>${inline(c)}</th>`).join('');
      const tr = rows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
      return `<div class="table"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody>\n</table></div>`;
    }
    if (/^- /.test(block)) {
      const items = [];
      for (const line of lines) {
        if (/^- /.test(line)) items.push(line.slice(2));
        else items[items.length - 1] += ' ' + line.trim();
      }
      return `<ul>\n${items.map((i) => `<li>${inline(i)}</li>`).join('\n')}\n</ul>`;
    }
    return `<p>${inline(lines.map((l) => l.trim()).join(' '))}</p>`;
  }).join('\n\n');
}

export function privacyPage(markdown) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Privacy policy · DigitalArkivet to FamilySearch</title>
<meta name="description" content="The privacy policy of DigitalArkivet to FamilySearch (arkivet2fs), a free genealogy extension for the browser.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="images/icon.svg" type="image/svg+xml">
<!-- Made from PRIVACY.md by tools/privacy-page.mjs: edit PRIVACY.md and run it again. -->
<style>
:root {
  --paper: #ffffff; --ink: #1f2a36; --muted: #546273; --deep: #2e547a;
  --parchment: #f4ecdc; --copper: #b0621f; --rule: #d9dee5;
  --serif: "Noto Serif", Georgia, "Times New Roman", serif;
  --sans: "Noto Sans", system-ui, "Segoe UI", Roboto, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #141b23; --ink: #e6ebf1; --muted: #a3b0bf; --deep: #a9c7e6;
    --parchment: #222c37; --copper: #e09a5c; --rule: #33404e;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --paper: #141b23; --ink: #e6ebf1; --muted: #a3b0bf; --deep: #a9c7e6;
  --parchment: #222c37; --copper: #e09a5c; --rule: #33404e;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.6 var(--sans); }
.wrap {
  max-width: 46rem; margin: 0 auto; padding-block: 24px 64px; display: grid; gap: 16px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
.home { font-size: .95rem; }
h1, h2 { font-family: var(--serif); color: var(--deep); margin: 0; line-height: 1.2; text-wrap: balance; }
h1 { font-size: clamp(1.8rem, 4.5vw, 2.4rem); }
h2 { font-size: 1.4rem; margin-top: 20px; }
p { margin: 0; }
a { color: var(--deep); text-underline-offset: 2px; overflow-wrap: anywhere; }
a:focus-visible { outline: 3px solid var(--copper); outline-offset: 2px; }
strong { font-weight: 600; }
code { font-size: .9em; background: var(--parchment); border-radius: 4px; padding: 0 4px; overflow-wrap: anywhere; }
ul { margin: 0; padding-left: 1.3rem; display: grid; gap: 6px; }
.table { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .95rem; }
th, td { text-align: left; vertical-align: top; padding: 10px 8px; border-bottom: 1px solid var(--rule); }
td code { overflow-wrap: normal; white-space: nowrap; }
th { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
@media (max-width: 700px) { body { font-size: 16px; } }
</style>
</head>
<body>
<main class="wrap">
<p class="home"><a href="./">← DigitalArkivet to FamilySearch</a></p>

${policyHtml(markdown)}
</main>
</body>
</html>
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const markdown = fs.readFileSync(path.join(ROOT, 'PRIVACY.md'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'docs/privacy.html'), privacyPage(markdown));
  console.log('docs/privacy.html');
}
