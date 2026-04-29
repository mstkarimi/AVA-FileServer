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

const HASH_RE = /^([A-Za-z0-9_-]{22})(?:(\.[A-Za-z0-9]+)|\/(.*))?$/;

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

function renderFolderIndex(share: Share, subPath: string, absDir: string, req: Request, res: Response) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    res.status(404).end();
    return;
  }

  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
  const files = entries.filter(e => e.isFile() && !e.name.startsWith('.'));
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

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

  // parent link
  if (subPath) {
    const parts = subPath.split('/').filter(Boolean);
    parts.pop();
    const up = parts.length === 0 ? `/${share.hash}/` : `/${share.hash}/${parts.map(encodeURIComponent).join('/')}/`;
    rows.push(`<tr><td><a href="${escapeHtml(up)}">📁 ../</a></td><td></td><td></td></tr>`);
  }

  for (const d of dirs) {
    const href = encodeURIComponent(d.name) + '/';
    rows.push(`<tr><td><a href="${escapeHtml(href)}">📁 ${escapeHtml(d.name)}/</a></td><td></td><td></td></tr>`);
  }

  for (const f of files) {
    const abs = path.join(absDir, f.name);
    let size = 0, mtime = 0;
    try {
      const st = fs.statSync(abs);
      size = st.size;
      mtime = st.mtimeMs;
    } catch {}
    const href = encodeURIComponent(f.name);
    const date = mtime ? new Date(mtime).toISOString().slice(0, 16).replace('T', ' ') : '';
    rows.push(
      `<tr><td><a href="${escapeHtml(href)}" dir="auto">📄 ${escapeHtml(f.name)}</a></td>` +
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
body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 1.5rem; max-width: 1000px; margin: 0 auto; background: #fafafa; color: #222; }
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
</style>
</head>
<body>
<h1>Index</h1>
<div class="crumbs">${breadcrumbsHtml}</div>
<table>
<thead><tr><th>Name</th><th class="num">Size</th><th class="date">Modified</th></tr></thead>
<tbody>${rows.join('\n')}</tbody>
</table>
<footer>Shared folder · ${dirs.length} folder${dirs.length === 1 ? '' : 's'}, ${files.length} file${files.length === 1 ? '' : 's'}</footer>
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
  const raw = (req.params as { 0: string })[0] || '';
  const m = raw.match(HASH_RE);
  if (!m) {
    res.status(404).end();
    return;
  }

  const hash = m[1]!;
  const ext = m[2];      // ".mp3" etc., or undefined
  const subRaw = m[3];   // path after slash, or undefined

  const share = getShareByHash(hash);
  if (!share) {
    res.status(404).end();
    return;
  }

  // FILE share
  if (share.share_type === 'file') {
    if (subRaw !== undefined) {
      // file shares don't have sub-paths
      res.status(404).end();
      return;
    }
    const absPath = path.join(config.filesRoot, share.file_path);
    try {
      fs.accessSync(absPath, fs.constants.R_OK);
    } catch {
      res.status(404).end();
      return;
    }
    setImmediate(() => incrementDownload(share.id));
    streamFile(req, res, absPath);
    return;
  }

  // FOLDER share
  if (ext) {
    // /HASH.ext for a folder share is invalid
    res.status(404).end();
    return;
  }

  const folderRoot = path.resolve(config.filesRoot, share.file_path);
  // Verify the folder still exists
  try {
    if (!fs.statSync(folderRoot).isDirectory()) {
      res.status(404).end();
      return;
    }
  } catch {
    res.status(404).end();
    return;
  }

  // /HASH (no slash) — redirect to /HASH/ for relative link consistency
  if (subRaw === undefined) {
    res.redirect(301, `/${hash}/`);
    return;
  }

  // /HASH/<sub>
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
    // Directory listings need trailing slash for relative links
    if (!req.path.endsWith('/')) {
      res.redirect(301, req.path + '/');
      return;
    }
    const subClean = decodeURIComponent(subRaw).replace(/\/+$/, '');
    renderFolderIndex(share, subClean, target, req, res);
    return;
  }

  // file inside folder share — stream
  setImmediate(() => incrementDownload(share.id));
  streamFile(req, res, target);
}

router.get('/*', handleShare);
router.head('/*', handleShare);

export default router;
