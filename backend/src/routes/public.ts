import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { getShareByHash, incrementDownload, Share } from '../services/shareService';
import { streamFile } from '../services/streamService';
import { config } from '../config';

const router = Router();

const shareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).end(),
});

router.use(shareLimiter);

// Express 4's `'/*'` route puts the captured tail in req.params[0]; behavior
// can vary subtly with mount points and path-to-regexp versions, so we read
// `req.path` directly — it is always the path within the router mount, with a
// leading slash and no query string.
//
// Recognised forms:
//   /HASH            file share (extension optional, just for player friendliness)
//   /HASH.mp3        file share with extension
//   /HASH/           folder share root
//   /HASH/sub/file   resource inside a folder share
const FILE_FORM_RE   = /^\/([A-Za-z0-9_-]{22})(?:\.[A-Za-z0-9]+)?$/;
const FOLDER_FORM_RE = /^\/([A-Za-z0-9_-]{22})\/(.*)$/;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]!);
}

function fmtSize(b: number): string {
  if (b === 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

function safeJoin(rootAbs: string, sub: string): string | null {
  const decoded = decodeURIComponent(sub);
  const joined = path.resolve(rootAbs, decoded);
  if (joined !== rootAbs && !joined.startsWith(rootAbs + path.sep)) return null;
  return joined;
}

function streamFileShare(share: Share, req: Request, res: Response): void {
  const absPath = path.join(config.filesRoot, share.file_path);
  try {
    fs.accessSync(absPath, fs.constants.R_OK);
  } catch {
    res.status(404).end();
    return;
  }
  setImmediate(() => incrementDownload(share.id));
  streamFile(req, res, absPath);
}

function renderFolderIndex(
  share: Share,
  subPath: string,
  absDir: string,
  req: Request,
  res: Response
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    res.status(404).end();
    return;
  }

  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
  const files = entries.filter(e => e.isFile() && !e.name.startsWith('.'));
  // Natural/numeric sort so "1.2" comes before "1.10" (matches the logged-in UI).
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  dirs.sort((a, b) => collator.compare(a.name, b.name));
  files.sort((a, b) => collator.compare(a.name, b.name));

  const breadcrumbs: { name: string; href: string }[] = [
    { name: path.basename(share.file_path) || 'root', href: `/${share.hash}/` },
  ];
  if (subPath) {
    const parts = subPath.split('/').filter(Boolean);
    let cum = '';
    for (const p of parts) {
      cum += encodeURIComponent(p) + '/';
      breadcrumbs.push({ name: p, href: `/${share.hash}/${cum}` });
    }
  }

  const rows: string[] = [];

  if (subPath) {
    const parts = subPath.split('/').filter(Boolean);
    parts.pop();
    const up = parts.length === 0
      ? `/${share.hash}/`
      : `/${share.hash}/${parts.map(encodeURIComponent).join('/')}/`;
    rows.push(`<tr><td class="cb"></td><td><a href="${escapeHtml(up)}">📁 ../</a></td><td></td><td></td></tr>`);
  }

  for (const d of dirs) {
    const href = encodeURIComponent(d.name) + '/';
    rows.push(
      `<tr><td class="cb"></td><td><a href="${escapeHtml(href)}">📁 ${escapeHtml(d.name)}/</a></td><td></td><td></td></tr>`
    );
  }

  for (const f of files) {
    const abs = path.join(absDir, f.name);
    let size = 0, mtime = 0;
    try { const st = fs.statSync(abs); size = st.size; mtime = st.mtimeMs; } catch { /* */ }
    const href = encodeURIComponent(f.name);
    const date = mtime ? new Date(mtime).toISOString().slice(0, 16).replace('T', ' ') : '';
    rows.push(
      `<tr>` +
      `<td class="cb"><input type="checkbox" class="sel" data-name="${escapeHtml(f.name)}" data-href="${escapeHtml(href)}" aria-label="Select ${escapeHtml(f.name)}"></td>` +
      `<td><a href="${escapeHtml(href)}" dir="auto">📄 ${escapeHtml(f.name)}</a></td>` +
      `<td class="num">${fmtSize(size)}</td><td class="date">${escapeHtml(date)}</td></tr>`
    );
  }

  const title = breadcrumbs.map(b => b.name).join(' / ');
  const breadcrumbsHtml = breadcrumbs
    .map((b, i) =>
      i === breadcrumbs.length - 1
        ? `<span>${escapeHtml(b.name)}</span>`
        : `<a href="${escapeHtml(b.href)}">${escapeHtml(b.name)}</a>`
    )
    .join(' <span class="sep">/</span> ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, sans-serif; margin: 0 auto; padding: 1.5rem; max-width: 1000px; background: #fafafa; color: #222; }
@media (prefers-color-scheme: dark) {
  body { background: #1a1a1a; color: #ddd; }
  table tr { border-bottom-color: #333; }
  a { color: #6cb6ff; }
  .crumbs { color: #888; }
}
h1 { font-size: 1.2rem; font-weight: 500; margin: 0 0 0.5rem; }
.crumbs { font-size: 0.9rem; color: #666; margin-bottom: 1rem; word-break: break-all; }
.crumbs a { color: inherit; }
.crumbs .sep { opacity: 0.5; margin: 0 0.25rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
th { font-weight: 500; font-size: 0.85rem; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
.num, .date { white-space: nowrap; color: #888; font-size: 0.9rem; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
tbody tr:hover { background: rgba(127,127,127,0.06); }
footer { margin-top: 2rem; font-size: 0.8rem; color: #999; text-align: center; }
.cb { width: 2.4rem; text-align: center; padding-left: 0.4rem; padding-right: 0.4rem; }
.cb input { width: 16px; height: 16px; cursor: pointer; vertical-align: middle; }
#bulkbar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 1rem; display: flex; align-items: center; gap: 0.75rem; background: #fff; color: #222; border: 1px solid #ddd; box-shadow: 0 4px 20px rgba(0,0,0,0.18); border-radius: 10px; padding: 0.55rem 1rem; font-size: 0.9rem; z-index: 10; max-width: calc(100vw - 2rem); }
#bulkbar button { background: #0066cc; color: #fff; border: 0; border-radius: 7px; padding: 0.45rem 0.9rem; font-size: 0.88rem; cursor: pointer; white-space: nowrap; }
#bulkbar button:hover { background: #0055aa; }
#bulkbar button:disabled { opacity: 0.6; cursor: default; }
#bulkcount { font-weight: 500; white-space: nowrap; }
#dlstatus { color: #888; font-size: 0.82rem; }
@media (prefers-color-scheme: dark) {
  #bulkbar { background: #2a2a2a; color: #ddd; border-color: #444; }
}
</style>
</head>
<body>
<h1>Index</h1>
<div class="crumbs">${breadcrumbsHtml}</div>
<table>
<thead><tr><th class="cb">${files.length ? '<input type="checkbox" id="selall" aria-label="Select all files">' : ''}</th><th>Name</th><th class="num">Size</th><th class="date">Modified</th></tr></thead>
<tbody>${rows.join('\n')}</tbody>
</table>
<footer>Shared folder · ${dirs.length} folder${dirs.length === 1 ? '' : 's'}, ${files.length} file${files.length === 1 ? '' : 's'}</footer>
<div id="bulkbar" hidden role="region" aria-label="Download selected files">
  <span id="bulkcount">0 selected</span>
  <button id="dlbtn" type="button">⬇ Download selected</button>
  <span id="dlstatus" aria-live="polite"></span>
</div>
<script>
(function(){
  var selall = document.getElementById('selall');
  var bar = document.getElementById('bulkbar');
  var count = document.getElementById('bulkcount');
  var btn = document.getElementById('dlbtn');
  var status = document.getElementById('dlstatus');
  function boxes(){ return [].slice.call(document.querySelectorAll('.sel')); }
  function checked(){ return boxes().filter(function(b){ return b.checked; }); }
  function refresh(){
    var n = checked().length;
    count.textContent = n + (n === 1 ? ' file selected' : ' files selected');
    bar.hidden = n === 0;
    if (selall){ var all = boxes(); selall.checked = n > 0 && n === all.length; selall.indeterminate = n > 0 && n < all.length; }
  }
  boxes().forEach(function(b){ b.addEventListener('change', refresh); });
  if (selall) selall.addEventListener('change', function(){ boxes().forEach(function(b){ b.checked = selall.checked; }); refresh(); });
  btn.addEventListener('click', function(){
    var items = checked();
    if (!items.length) return;
    btn.disabled = true;
    var i = 0;
    // Sequential, spaced downloads: lightest on the server (reuses the normal
    // range-capable file stream, no zip/CPU) and stays under the per-IP
    // concurrent-download cap. The 800ms gap lets the browser register each
    // download instead of dropping rapid-fire ones.
    function next(){
      if (i >= items.length){ status.textContent = 'Started ' + items.length + ' download(s) ✓'; btn.disabled = false; return; }
      var b = items[i++];
      var a = document.createElement('a');
      a.href = b.dataset.href; a.download = b.dataset.name;
      document.body.appendChild(a); a.click(); a.remove();
      status.textContent = 'Downloading ' + i + ' / ' + items.length + '…';
      setTimeout(next, 800);
    }
    next();
  });
  refresh();
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  res.status(200).send(html);
}

function handleShare(req: Request, res: Response): void {
  // Match against the path inside the mount point (e.g. /HASH.mp3 when
  // mounted at /s and requested via /s/HASH.mp3).
  const p = req.path;

  // ---- File-form URL: /HASH or /HASH.ext  --------------------------------
  let m = p.match(FILE_FORM_RE);
  if (m) {
    const share = getShareByHash(m[1]!);
    if (!share) { res.status(404).end(); return; }
    if (share.revoked_at) { res.status(410).end(); return; }  // Gone — link revoked

    if (share.share_type === 'file') {
      streamFileShare(share, req, res);
      return;
    }

    // /HASH for a folder share — redirect to /HASH/ for proper relative links.
    if (share.share_type === 'folder') {
      // If request was /HASH.mp3 (folder share with extension), reject — folders
      // don't have meaningful extensions and players asking for a file shouldn't
      // accidentally land on an HTML index.
      if (p.includes('.')) { res.status(404).end(); return; }
      res.redirect(301, `/${share.hash}/`);
      return;
    }

    res.status(404).end();
    return;
  }

  // ---- Folder-form URL: /HASH/ or /HASH/sub/path  ------------------------
  m = p.match(FOLDER_FORM_RE);
  if (m) {
    const share = getShareByHash(m[1]!);
    if (!share || share.share_type !== 'folder') {
      res.status(404).end();
      return;
    }
    if (share.revoked_at) { res.status(410).end(); return; }  // Gone — link revoked

    const folderRoot = path.resolve(config.filesRoot, share.file_path);
    try {
      if (!fs.statSync(folderRoot).isDirectory()) {
        res.status(404).end();
        return;
      }
    } catch {
      res.status(404).end();
      return;
    }

    const subRaw = m[2]!;          // may be empty for "/HASH/"
    const target = safeJoin(folderRoot, subRaw);
    if (!target) {
      res.status(400).end();
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      res.status(404).end();
      return;
    }

    if (stat.isDirectory()) {
      // Directory listings need trailing slash so relative links resolve.
      if (!req.path.endsWith('/')) {
        res.redirect(301, req.path + '/');
        return;
      }
      const subClean = decodeURIComponent(subRaw).replace(/\/+$/, '');
      renderFolderIndex(share, subClean, target, req, res);
      return;
    }

    // file inside a folder share — stream it
    setImmediate(() => incrementDownload(share.id));
    streamFile(req, res, target);
    return;
  }

  res.status(404).end();
}

router.get('/*', handleShare);
router.head('/*', handleShare);

export default router;
