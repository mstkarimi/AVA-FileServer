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

/**
 * Inline file-type icons for the public index. Inline SVG rather than emoji so
 * the page renders identically everywhere (emoji glyphs differ wildly across
 * platforms and ignore the colour scheme) and still needs zero requests.
 */
const SVG = (cls: string, body: string): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const DOC_PATH = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';

const ICON = {
  up:      SVG('i-folder',  '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  folder:  SVG('i-folder',  '<path d="M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  audio:   SVG('i-audio',   '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
  video:   SVG('i-video',   '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>'),
  image:   SVG('i-image',   '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.6-4.6a2 2 0 0 0-2.8 0L3 21"/>'),
  doc:     SVG('i-doc',     DOC_PATH),
  archive: SVG('i-archive', '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>'),
  file:    SVG('i-file',    DOC_PATH),
  link:    SVG('',          '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>'),
  tab:     SVG('',          '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  dl:      SVG('',          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  viewList: SVG('',         '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  viewGrid: SVG('',         '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
};

const EXT_KIND: Record<string, keyof typeof ICON> = {};
const mapExt = (kind: keyof typeof ICON, exts: string[]): void => {
  exts.forEach(e => { EXT_KIND[e] = kind; });
};
mapExt('audio',   ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus']);
mapExt('video',   ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg']);
mapExt('image',   ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tif', 'tiff']);
mapExt('doc',     ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'ppt', 'pptx', 'xls', 'xlsx', 'csv']);
mapExt('archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso']);

function iconFor(name: string): string {
  const i = name.lastIndexOf('.');
  const ext = i <= 0 ? '' : name.slice(i + 1).toLowerCase();
  return ICON[EXT_KIND[ext] || 'file'];
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

  const items: string[] = [];

  if (subPath) {
    const parts = subPath.split('/').filter(Boolean);
    parts.pop();
    const up = parts.length === 0
      ? `/${share.hash}/`
      : `/${share.hash}/${parts.map(encodeURIComponent).join('/')}/`;
    items.push(
      `<div class="item up" data-name=".." data-kind="up">` +
      `<span class="cb"></span>` +
      `<a class="nm" href="${escapeHtml(up)}">${ICON.up}<span class="lbl">..</span></a>` +
      `<span class="sz"></span><span class="dt"></span><span class="act"></span></div>`
    );
  }

  for (const d of dirs) {
    const href = encodeURIComponent(d.name) + '/';
    items.push(
      `<div class="item" data-name="${escapeHtml(d.name.toLowerCase())}" data-href="${escapeHtml(href)}" data-kind="dir">` +
      `<span class="cb"></span>` +
      `<a class="nm" href="${escapeHtml(href)}" dir="auto">${ICON.folder}<span class="lbl">${escapeHtml(d.name)}</span></a>` +
      `<span class="sz">Folder</span><span class="dt"></span>` +
      `<span class="act">` +
      `<button type="button" class="ab" data-do="link" title="Copy link" aria-label="Copy link to ${escapeHtml(d.name)}">${ICON.link}</button>` +
      `<button type="button" class="ab" data-do="tab" title="Open in new tab" aria-label="Open ${escapeHtml(d.name)} in a new tab">${ICON.tab}</button>` +
      `</span></div>`
    );
  }

  for (const f of files) {
    const abs = path.join(absDir, f.name);
    let size = 0, mtime = 0;
    try { const st = fs.statSync(abs); size = st.size; mtime = st.mtimeMs; } catch { /* */ }
    const href = encodeURIComponent(f.name);
    const date = mtime ? new Date(mtime).toISOString().slice(0, 16).replace('T', ' ') : '';
    items.push(
      `<div class="item" data-name="${escapeHtml(f.name.toLowerCase())}" data-href="${escapeHtml(href)}" data-dl="${escapeHtml(f.name)}" data-kind="file">` +
      `<label class="cb"><input type="checkbox" class="sel" data-name="${escapeHtml(f.name)}" data-href="${escapeHtml(href)}" aria-label="Select ${escapeHtml(f.name)}"></label>` +
      `<a class="nm" href="${escapeHtml(href)}" dir="auto">${iconFor(f.name)}<span class="lbl">${escapeHtml(f.name)}</span></a>` +
      `<span class="sz">${fmtSize(size)}</span><span class="dt">${escapeHtml(date)}</span>` +
      `<span class="act">` +
      `<button type="button" class="ab" data-do="link" title="Copy link" aria-label="Copy link to ${escapeHtml(f.name)}">${ICON.link}</button>` +
      `<button type="button" class="ab" data-do="tab" title="Open in new tab" aria-label="Open ${escapeHtml(f.name)} in a new tab">${ICON.tab}</button>` +
      `<button type="button" class="ab" data-do="dl" title="Download" aria-label="Download ${escapeHtml(f.name)}">${ICON.dl}</button>` +
      `</span></div>`
    );
  }

  const folderName = breadcrumbs[breadcrumbs.length - 1]?.name || 'Shared folder';
  const title = breadcrumbs.map(b => b.name).join(' / ');
  const breadcrumbsHtml = breadcrumbs
    .map((b, i) =>
      i === breadcrumbs.length - 1
        ? `<span aria-current="page">${escapeHtml(b.name)}</span>`
        : `<a href="${escapeHtml(b.href)}">${escapeHtml(b.name)}</a>`
    )
    .join('<span class="sep">/</span>');

  const countLine =
    `${dirs.length} folder${dirs.length === 1 ? '' : 's'} · ${files.length} file${files.length === 1 ? '' : 's'}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
:root{
  color-scheme: light dark;
  --bg:#f8fafc; --panel:#ffffff; --text:#0f172a; --muted:#64748b; --faint:#94a3b8;
  --line:#e2e8f0; --hover:#f1f5f9; --accent:#2563eb; --accent-soft:#eff6ff;
  --shadow:0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.08);
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0f172a; --panel:#1e293b; --text:#e2e8f0; --muted:#94a3b8; --faint:#64748b;
    --line:#334155; --hover:#26334a; --accent:#60a5fa; --accent-soft:#1e3a8a33;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
  }
}
*{box-sizing:border-box}
body{margin:0;padding:2rem 1rem 6rem;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;background:var(--bg);color:var(--text)}
.wrap{max-width:1080px;margin:0 auto}
h1{font-size:1.35rem;font-weight:600;margin:0 0 .35rem;letter-spacing:-.01em;word-break:break-word}
.crumbs{font-size:.82rem;color:var(--muted);margin-bottom:.15rem;word-break:break-all}
.crumbs a{color:inherit;text-decoration:none}.crumbs a:hover{color:var(--accent);text-decoration:underline}
.crumbs .sep{opacity:.45;margin:0 .4rem}
.count{font-size:.78rem;color:var(--faint);margin-bottom:1.1rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.tools{display:flex;align-items:center;gap:.6rem;padding:.6rem .85rem;border-bottom:1px solid var(--line)}
.tools input[type=search]{flex:1;min-width:0;appearance:none;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:.4rem .7rem;font-size:.85rem;color:var(--text);font-family:inherit}
.tools input[type=search]:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.tools label.all{display:flex;align-items:center;gap:.45rem;font-size:.8rem;color:var(--muted);white-space:nowrap;cursor:pointer}
.seg{display:flex;gap:.15rem;padding:.15rem;border-radius:9px;background:var(--bg);border:1px solid var(--line)}
.seg button{display:flex;align-items:center;justify-content:center;width:30px;height:28px;border:0;border-radius:7px;background:none;color:var(--muted);cursor:pointer}
.seg button.on{background:var(--panel);color:var(--accent);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.seg svg{width:16px;height:16px}
input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;margin:0}
.head{display:grid;grid-template-columns:2.4rem 1fr 6rem 9.5rem 6.5rem;gap:.5rem;padding:.5rem .85rem;border-bottom:1px solid var(--line);font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
.head .r{text-align:right}
.item{align-items:center}
.item .cb{display:flex;align-items:center;justify-content:center}
.item .nm{display:flex;align-items:center;gap:.55rem;color:var(--text);text-decoration:none;min-width:0}
.item .nm .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.875rem}
.item .nm:hover .lbl{color:var(--accent);text-decoration:underline}
.item .nm svg{flex:0 0 auto;width:18px;height:18px;stroke-width:1.8}
.i-folder{color:#f59e0b}.i-audio{color:#0ea5e9}.i-video{color:#8b5cf6}.i-image{color:#10b981}.i-doc{color:#f97316}.i-archive{color:#ca8a04}.i-file{color:var(--faint)}
.sz,.dt{color:var(--muted);font-size:.78rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.act{display:flex;align-items:center;gap:.1rem;justify-content:flex-end}
.ab{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:8px;background:none;color:var(--faint);cursor:pointer}
.ab:hover{background:var(--hover);color:var(--accent)}
.ab svg{width:16px;height:16px;stroke-width:1.9}
.up .lbl{color:var(--muted)}

/* ---- List view (default): aligned columns, one row per item ---- */
.view-list #items .item{display:grid;grid-template-columns:2.4rem 1fr 6rem 9.5rem 6.5rem;gap:.5rem;padding:.35rem .85rem;border-bottom:1px solid var(--line)}
.view-list #items .item:last-child{border-bottom:0}
.view-list #items .item:hover{background:var(--hover)}
.view-list #items .item.on{background:var(--accent-soft)}
.view-list .sz{text-align:right}
.view-list .act{opacity:0;transition:opacity .12s}
.view-list .item:hover .act,.view-list .item:focus-within .act,.view-list .item.on .act{opacity:1}

/* ---- Grid view: cards ---- */
.head.list-only{display:grid}
.view-grid .head.list-only{display:none}
.view-grid #items{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.6rem;padding:.85rem}
.view-grid #items .item{position:relative;display:flex;flex-direction:column;gap:.4rem;padding:.85rem;border:1px solid var(--line);border-radius:12px}
.view-grid #items .item:hover{border-color:var(--accent);background:var(--hover)}
.view-grid #items .item.on{border-color:var(--accent);background:var(--accent-soft)}
.view-grid .item .cb{position:absolute;top:.5rem;left:.5rem}
.view-grid .item .nm{flex-direction:column;text-align:center;gap:.5rem}
.view-grid .item .nm svg{width:38px;height:38px}
.view-grid .item .nm .lbl{white-space:normal;max-height:2.4em;font-size:.8rem;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.view-grid .dt{display:none}
.view-grid .sz{text-align:center;font-size:.72rem}
.view-grid .act{justify-content:center;opacity:0;transition:opacity .12s}
.view-grid .item:hover .act,.view-grid .item:focus-within .act,.view-grid .item.on .act{opacity:1}
.view-grid .item.up{display:none}

.empty{padding:2.5rem;text-align:center;color:var(--muted);font-size:.85rem}

#bar{position:fixed;left:50%;bottom:1.25rem;transform:translateX(-50%) translateY(150%);display:flex;align-items:center;gap:.85rem;background:var(--panel);color:var(--text);border:1px solid var(--line);box-shadow:var(--shadow);border-radius:12px;padding:.6rem .75rem .6rem 1rem;font-size:.85rem;max-width:calc(100vw - 2rem);z-index:20;opacity:0;pointer-events:none;transition:transform .18s ease,opacity .18s ease}
#bar.on{transform:translateX(-50%) translateY(0);opacity:1;pointer-events:auto}
#bar b{font-weight:600;white-space:nowrap}
#dl{display:inline-flex;align-items:center;gap:.4rem;background:var(--accent);color:#fff;border:0;border-radius:9px;padding:.45rem .9rem;font-size:.84rem;font-family:inherit;cursor:pointer;white-space:nowrap}
#dl:hover{filter:brightness(1.08)}#dl:disabled{opacity:.6;cursor:default}
#clear{background:none;border:0;color:var(--muted);cursor:pointer;font-size:1.1rem;line-height:1;padding:.2rem .35rem;font-family:inherit}#clear:hover{color:var(--text)}
#st{color:var(--muted);font-size:.78rem;white-space:nowrap}
footer{margin-top:1.5rem;text-align:center;font-size:.75rem;color:var(--faint)}
.toast{position:fixed;left:50%;bottom:5.5rem;transform:translateX(-50%);background:#16a34a;color:#fff;padding:.5rem .9rem;border-radius:9px;font-size:.82rem;opacity:0;transition:opacity .2s;pointer-events:none;z-index:30}
.toast.on{opacity:1}
@media (max-width:640px){
  body{padding:1.25rem .75rem 6rem}
  .view-list #items .item,.head{grid-template-columns:2.2rem 1fr 5rem 4rem;}
  .dt{display:none}.head .dt{display:none}
}
@media (prefers-reduced-motion: reduce){#bar,.act,.toast{transition:none}}
</style>
</head>
<body>
<div class="wrap">
  <h1 dir="auto">${escapeHtml(folderName)}</h1>
  <nav class="crumbs" aria-label="Breadcrumb">${breadcrumbsHtml}</nav>
  <div class="count">${countLine}</div>

  <div class="panel">
    <div class="tools">
      ${files.length ? '<label class="all"><input type="checkbox" id="all"> Select all</label>' : ''}
      <input type="search" id="filter" placeholder="Filter by name…" aria-label="Filter by name" autocomplete="off">
      <div class="seg" role="group" aria-label="View mode">
        <button type="button" id="v-list" class="on" title="List view" aria-label="List view">${ICON.viewList}</button>
        <button type="button" id="v-grid" title="Grid view" aria-label="Grid view">${ICON.viewGrid}</button>
      </div>
    </div>
    <div class="head list-only">
      <span></span><span>Name</span><span class="r">Size</span><span>Modified</span><span></span>
    </div>
    <div id="items">${items.join('\n')}</div>
    ${items.length === 0 ? '<div class="empty">This folder is empty.</div>' : ''}
    <div class="empty" id="nomatch" style="display:none">No items match that filter.</div>
  </div>

  <footer>Shared folder</footer>
</div>

<div id="bar" role="region" aria-label="Selected files">
  <b id="n">0 selected</b>
  <button id="dl" type="button">Download selected</button>
  <span id="st" aria-live="polite"></span>
  <button id="clear" type="button" title="Clear selection" aria-label="Clear selection">&times;</button>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
(function(){
  var root = document.documentElement;
  var all = document.getElementById('all');
  var bar = document.getElementById('bar');
  var n = document.getElementById('n');
  var dl = document.getElementById('dl');
  var st = document.getElementById('st');
  var clear = document.getElementById('clear');
  var filter = document.getElementById('filter');
  var items = document.getElementById('items');
  var nomatch = document.getElementById('nomatch');
  var panel = items.parentNode;
  var toastEl = document.getElementById('toast');
  var toastT = null;

  function boxes(){ return [].slice.call(document.querySelectorAll('.sel')); }
  function visRows(){ return [].slice.call(items.children).filter(function(r){ return r.style.display !== 'none'; }); }
  function visibleBoxes(){ return boxes().filter(function(b){ return b.closest('.item').style.display !== 'none'; }); }
  function checked(){ return boxes().filter(function(b){ return b.checked; }); }

  function toast(msg){
    toastEl.textContent = msg; toastEl.classList.add('on');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function(){ toastEl.classList.remove('on'); }, 1800);
  }

  // Copy with a legacy fallback: some browsers/policies block the async
  // clipboard API even over https, so fall back to a hidden textarea + execCommand.
  function copyText(text){
    function legacy(){
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly','');
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        toast(ok ? 'Link copied' : 'Copy failed');
      } catch(e){ toast('Copy failed'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){ toast('Link copied'); }, legacy);
    } else { legacy(); }
  }

  function refresh(){
    var c = checked().length;
    n.textContent = c + (c === 1 ? ' file selected' : ' files selected');
    bar.classList.toggle('on', c > 0);
    if (c === 0) st.textContent = '';
    boxes().forEach(function(b){ b.closest('.item').classList.toggle('on', b.checked); });
    if (all){
      var vis = visibleBoxes();
      var vc = vis.filter(function(b){ return b.checked; }).length;
      all.checked = vis.length > 0 && vc === vis.length;
      all.indeterminate = vc > 0 && vc < vis.length;
    }
  }

  // View mode (persisted). Never trust the stored value blindly.
  function setView(v){
    var grid = v === 'grid';
    panel.parentNode.classList.remove('view-list','view-grid');
    panel.parentNode.classList.add(grid ? 'view-grid' : 'view-list');
    document.getElementById('v-grid').classList.toggle('on', grid);
    document.getElementById('v-list').classList.toggle('on', !grid);
    try { localStorage.setItem('share.view', grid ? 'grid' : 'list'); } catch(e){}
  }
  var saved = 'list';
  try { if (localStorage.getItem('share.view') === 'grid') saved = 'grid'; } catch(e){}
  setView(saved);
  document.getElementById('v-list').addEventListener('click', function(){ setView('list'); });
  document.getElementById('v-grid').addEventListener('click', function(){ setView('grid'); });

  items.addEventListener('change', function(e){ if (e.target.classList.contains('sel')) refresh(); });
  if (all) all.addEventListener('change', function(){ visibleBoxes().forEach(function(b){ b.checked = all.checked; }); refresh(); });
  clear.addEventListener('click', function(){ boxes().forEach(function(b){ b.checked = false; }); refresh(); });

  // Per-item action buttons (delegated).
  items.addEventListener('click', function(e){
    var btn = e.target.closest('.ab'); if (!btn) return;
    e.preventDefault();
    var item = btn.closest('.item');
    var rel = item.getAttribute('data-href'); if (!rel) return;
    var url = new URL(rel, location.href).href;
    var act = btn.getAttribute('data-do');
    if (act === 'tab') { window.open(url, '_blank', 'noopener'); }
    else if (act === 'link') { copyText(url); }
    else if (act === 'dl') {
      var a = document.createElement('a'); a.href = url; a.download = item.getAttribute('data-dl') || '';
      document.body.appendChild(a); a.click(); a.remove();
    }
  });

  if (filter) filter.addEventListener('input', function(){
    var q = filter.value.trim().toLowerCase();
    var shown = 0;
    [].slice.call(items.children).forEach(function(it){
      if (it.classList.contains('up')) return;
      var hit = !q || (it.getAttribute('data-name') || '').indexOf(q) !== -1;
      it.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    nomatch.style.display = shown === 0 ? '' : 'none';
    refresh();
  });

  dl.addEventListener('click', function(){
    var list = checked();
    if (!list.length) return;
    dl.disabled = true;
    var i = 0;
    // Sequential, spaced downloads — lightest on the server (reuses the normal
    // range-capable file stream, no zip, no CPU) and stays under the per-IP
    // concurrency cap. The gap lets the browser register each download.
    function next(){
      if (i >= list.length){ st.textContent = 'Started ' + list.length + ' download' + (list.length === 1 ? '' : 's'); dl.disabled = false; return; }
      var b = list[i++];
      var a = document.createElement('a'); a.href = b.dataset.href; a.download = b.dataset.name;
      document.body.appendChild(a); a.click(); a.remove();
      st.textContent = 'Downloading ' + i + ' / ' + list.length;
      setTimeout(next, 800);
    }
    next();
  });

  refresh();
  window.addEventListener('pageshow', refresh);
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
