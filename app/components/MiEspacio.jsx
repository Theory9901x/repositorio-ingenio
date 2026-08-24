"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Menu,
  AlertCircle, ArrowLeft, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download,
  Eye, FileArchive, FileImage, FileSpreadsheet, FileText, Folder, FolderOpen,
  FolderPlus, Grid2X2, Home, Link2, List, LogOut, MoreHorizontal, Pencil, Plus,
  Presentation, Search, Settings, Sparkles, Star, Trash2, Upload,
} from "lucide-react";
import EmbeddedFileViewer from "./EmbeddedFileViewer";

const NAV = [
  { id: "espacio", label: "Mi espacio / Plan", icon: Home },
  { id: "carpetas", label: "Carpetas", icon: Folder },
  { id: "archivos", label: "Archivos", icon: FileText },
  { id: "favoritos", label: "Favoritos", icon: Star },
  { id: "papelera", label: "Papelera", icon: Trash2 },
  { id: "ajustes", label: "Ajustes", icon: Settings },
];

const EXT_KIND = { pdf: "pdf", xls: "xls", xlsx: "xls", csv: "xls", doc: "doc", docx: "doc", ppt: "ppt", pptx: "ppt", png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", svg: "img", zip: "zip", rar: "zip", "7z": "zip" };
const KIND_ICON = { pdf: FileText, xls: FileSpreadsheet, doc: FileText, ppt: Presentation, img: FileImage, zip: FileArchive, ref: Link2, otro: FileText };

function extOf(f) {
  if (f.source === "repo_reference") return "REF";
  const name = f.file_name || f.title || "";
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : "—";
}
function kindOf(f) {
  if (f.source === "repo_reference") return "ref";
  return EXT_KIND[extOf(f).toLowerCase()] || "otro";
}
function fmtSize(b) {
  if (!b) return "—";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d)) return s;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const diff = (hoy - dia) / 86400000;
  if (diff === 0) return "Hoy, " + hm;
  if (diff === 1) return "Ayer, " + hm;
  return `${d.getDate()} ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
}
function daysAgo(s, n) {
  const d = new Date(String(s).replace(" ", "T"));
  return !isNaN(d) && Date.now() - d.getTime() <= n * 86400000;
}
function loadLS(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const PAGE_SIZE = 8;

export default function MiEspacio({ user }) {
  const [menuAbierto, setMenuAbierto] = useState(false); // cajón lateral en móvil
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [repoFavs, setRepoFavs] = useState([]);
  const [view, setView] = useState("espacio");
  const [selFolder, setSelFolder] = useState(null);
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("list");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: "", date: "", fav: "" });
  const [starred, setStarred] = useState([]);
  const [trashLog, setTrashLog] = useState([]);
  const [modal, setModal] = useState(null);
  const [modalText, setModalText] = useState("");
  const [menuId, setMenuId] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [vivid, setVivid] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const searchInput = useRef(null);

  async function load() {
    const [f, fl, fav] = await Promise.all([
      fetch("/api/workspace/folders").then((r) => r.json()),
      fetch("/api/workspace/files").then((r) => r.json()),
      fetch("/api/favorites").then((r) => r.json()).catch(() => []),
    ]);
    setFolders(Array.isArray(f) ? f : []);
    setFiles(Array.isArray(fl) ? fl : []);
    setRepoFavs(Array.isArray(fav) ? fav : []);
  }
  useEffect(() => {
    load();
    setStarred(loadLS("me-starred", []));
    setTrashLog(loadLS("me-trash-log", []));
    const prefs = loadLS("me-prefs", {});
    if (prefs.mode) setMode(prefs.mode);
    if (prefs.vivid) setVivid(true);
  }, []);
  useEffect(() => {
    // React se monta sobre el document en el App Router, así que este listener
    // vive en el mismo nodo que los handlers de React y stopPropagation no lo
    // frena: hay que decidir por el destino del clic.
    const close = (e) => {
      const t = e.target;
      if (t instanceof Element && (t.closest(".me-menu") || t.closest(".me-dots") || t.closest(".me-notif-wrap"))) return;
      setMenuId(null);
      setNotifOpen(false);
    };
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchInput.current?.focus(); }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => { setPage(1); }, [selFolder, query, filters, view]);

  function notify(msg, tipo = "ok") { setToast({ msg, tipo }); setTimeout(() => setToast(null), tipo === "error" ? 4200 : 2600); }
  function setPref(patch) {
    const prefs = { ...loadLS("me-prefs", {}), ...patch };
    saveLS("me-prefs", prefs);
  }

  async function errorOf(res, fallback) {
    const data = await res.json().catch(() => ({}));
    return data.error || `${fallback} (error ${res.status})`;
  }

  /* ---------- carpetas ---------- */
  const childrenOf = (pid) => folders.filter((f) => (f.parent_id || null) === pid);
  // Ids de la carpeta indicada y de todas sus subcarpetas.
  function descendants(id) {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
      }
    }
    return ids;
  }
  // Qué se eliminaría al borrar una carpeta.
  function contentsOf(id) {
    const ids = descendants(id);
    return {
      subcarpetas: ids.size - 1,
      archivos: files.filter((f) => ids.has(f.folder_id)).length,
    };
  }
  const filesIn = (fid) => files.filter((f) => (f.folder_id || null) === fid);
  const folderById = (id) => folders.find((f) => f.id === id);
  const crumbs = useMemo(() => {
    const path = [];
    let cur = selFolder;
    while (cur) { const f = folderById(cur); if (!f) break; path.unshift(f); cur = f.parent_id || null; }
    return path;
  }, [selFolder, folders]);

  async function createFolder(name, parentId) {
    await fetch("/api/workspace/folders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId, section: "personal" }),
    });
    notify("Carpeta creada"); load();
  }
  async function renameFolder(id, name) {
    const res = await fetch(`/api/workspace/folders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return notify(await errorOf(res, "No se pudo renombrar la carpeta"), "error");
    notify("Carpeta renombrada"); load();
  }
  async function deleteFolder(id) {
    const res = await fetch(`/api/workspace/folders/${id}`, { method: "DELETE" });
    if (!res.ok) return notify(await errorOf(res, "No se pudo eliminar la carpeta"), "error");
    const data = await res.json().catch(() => ({}));
    if (selFolder === id || descendants(id).has(selFolder)) setSelFolder(null);
    notify(data.archivos ? `Carpeta eliminada · ${data.archivos} archivo(s)` : "Carpeta eliminada");
    load();
  }

  /* ---------- archivos ---------- */
  async function upload(fileObj) {
    if (!fileObj) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("source", "personal");
    if (selFolder) fd.set("folderId", selFolder);
    fd.set("title", fileObj.name);
    fd.set("file", fileObj);
    const res = await fetch("/api/workspace/files", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) return notify(await errorOf(res, "No se pudo subir el archivo"), "error");
    notify("Archivo agregado a tu espacio");
    load();
  }
  async function deleteFile(f) {
    const res = await fetch(`/api/workspace/files/${f.id}`, { method: "DELETE" });
    if (!res.ok) return notify(await errorOf(res, "No se pudo eliminar el archivo"), "error");
    const log = [{ title: f.title || f.file_name, ext: extOf(f), at: new Date().toISOString().slice(0, 16).replace("T", " ") }, ...trashLog].slice(0, 30);
    setTrashLog(log); saveLS("me-trash-log", log);
    notify("Archivo eliminado"); load();
  }
  function toggleStar(id) {
    const next = starred.includes(id) ? starred.filter((x) => x !== id) : [...starred, id];
    setStarred(next); saveLS("me-starred", next);
  }
  function fileUrl(f, download) {
    if (f.source === "repo_reference") return `/api/documents/${f.repo_document_id}/file`;
    return `/api/workspace/files/${f.id}/file${download ? "?download=1" : ""}`;
  }
  function openFile(f) {
    const isRef = f.source === "repo_reference";
    setViewer({
      title: f.title || f.file_name,
      fileName: f.file_name || f.repo_name || f.title,
      mime: f.mime_type,
      size: f.size_bytes,
      date: fmtDate(f.created_at),
      sourceLabel: isRef ? `Repositorio institucional · ${f.repo_code || ""}`.trim() : "Mi espacio",
      location: crumbs.length ? crumbs.map((c) => c.name).join(" / ") : "Mis carpetas",
      url: fileUrl(f),
      downloadUrl: fileUrl(f, true),
    });
  }
  function download(f) {
    const a = document.createElement("a");
    a.href = fileUrl(f, true);
    a.download = f.file_name || f.title || "archivo";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function downloadAll() {
    const params = selFolder ? `?scope=folder&folderId=${selFolder}` : view === "espacio" ? "?scope=folder" : "";
    const a = document.createElement("a");
    a.href = `/api/workspace/download-all${params}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    notify("Preparando descarga…");
  }

  /* ---------- derivados ---------- */
  const recientes = files.filter((f) => daysAgo(f.created_at, 7));
  const totalFavs = starred.filter((id) => files.some((f) => f.id === id)).length + repoFavs.length;

  function applyFilters(list) {
    return list.filter((f) => {
      const q = query.trim().toLowerCase();
      if (q && ![f.title, f.file_name, f.repo_code].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      if (filters.type && extOf(f) !== filters.type) return false;
      if (filters.date === "hoy" && !daysAgo(f.created_at, 1)) return false;
      if (filters.date === "7" && !daysAgo(f.created_at, 7)) return false;
      if (filters.date === "30" && !daysAgo(f.created_at, 30)) return false;
      if (filters.fav === "si" && !starred.includes(f.id)) return false;
      return true;
    });
  }

  const scope = view === "archivos" ? files
    : view === "favoritos" ? files.filter((f) => starred.includes(f.id))
    : filesIn(selFolder);
  const visible = applyFilters(scope);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageFiles = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const extOptions = [...new Set(files.map(extOf))].filter((e) => e !== "—").sort();

  const activity = useMemo(() => {
    const items = [
      ...files.map((f) => ({ kind: kindOf(f), title: f.title || f.file_name, action: f.source === "repo_reference" ? "Referencia agregada" : "Subido por ti", at: f.created_at })),
      ...folders.map((f) => ({ kind: "folder", title: f.name, action: "Carpeta creada", at: f.created_at })),
    ];
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);
  }, [files, folders]);

  const detailFolder = selFolder ? folderById(selFolder) : null;
  const detailFiles = filesIn(selFolder);
  const lastMod = detailFiles.map((f) => f.created_at).sort().pop();

  /* ---------- sub-render ---------- */
  function renderTree(node, level = 0) {
    const kids = childrenOf(node.id);
    const isOpen = open[node.id] !== false;
    return (
      <div key={node.id}>
        <div className={`me-tree-row ${selFolder === node.id ? "on" : ""}`} style={{ paddingLeft: 9 + level * 15 }} onClick={() => { setSelFolder(node.id); setView("espacio"); }}>
          <button className="me-tree-caret" onClick={(e) => { e.stopPropagation(); setOpen({ ...open, [node.id]: !isOpen }); }}>
            {kids.length ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <i />}
          </button>
          {selFolder === node.id ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span className="me-tree-name">{node.name}</span>
          <span className="me-tree-count">{filesIn(node.id).length}</span>
          <span className="me-tree-act" onClick={(e) => e.stopPropagation()}>
            <button title="Subcarpeta" onClick={() => { setModal({ type: "folder-new", parentId: node.id }); setModalText(""); }}><Plus size={12} /></button>
            <button title="Renombrar" onClick={() => { setModal({ type: "folder-rename", id: node.id }); setModalText(node.name); }}><Pencil size={12} /></button>
            <button title="Eliminar" onClick={() => setModal({ type: "del-folder", id: node.id, name: node.name })}><Trash2 size={12} /></button>
          </span>
        </div>
        {isOpen && kids.map((k) => renderTree(k, level + 1))}
      </div>
    );
  }

  function FileRow(f) {
    const kind = kindOf(f);
    const Icon = KIND_ICON[kind];
    const isStar = starred.includes(f.id);
    return (
      <div className="me-frow" key={f.id} onClick={() => openFile(f)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFile(f); } }}>
        <div className="me-fname">
          <span className={`me-ficon ${kind}`}><Icon size={17} /></span>
          <div style={{ minWidth: 0 }}>
            <b>{f.title || f.file_name}</b>
            {f.source === "repo_reference" && <small>Referencia · {f.repo_code}</small>}
          </div>
        </div>
        <span className="me-ftype">{extOf(f)}</span>
        <span className="me-fsize">{fmtSize(f.size_bytes)}</span>
        <span className="me-fdate">{fmtDate(f.created_at)}</span>
        <div className="me-fact" onClick={(e) => e.stopPropagation()}>
          <button className="me-iconact" title="Ver documento" onClick={() => openFile(f)}><Eye size={15} /></button>
          <button className="me-iconact" title="Descargar" onClick={() => download(f)}><Download size={15} /></button>
          <button className={`me-star ${isStar ? "on" : ""}`} title="Favorito" onClick={() => toggleStar(f.id)}><Star size={15} /></button>
          <button className="me-dots" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === f.id ? null : f.id); }}><MoreHorizontal size={16} /></button>
          {menuId === f.id && (
            <div className="me-menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setMenuId(null); openFile(f); }}><Eye size={14} /> Ver documento</button>
              <button onClick={() => { setMenuId(null); download(f); }}><Download size={14} /> Descargar</button>
              <button onClick={() => toggleStar(f.id)}><Star size={14} /> {isStar ? "Quitar favorito" : "Marcar favorito"}</button>
              <button className="danger" onClick={() => { setMenuId(null); setModal({ type: "del-file", file: f }); }}><Trash2 size={14} /> Eliminar</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function FileCard(f) {
    const kind = kindOf(f);
    const Icon = KIND_ICON[kind];
    return (
      <div className="me-filecard" key={f.id} onClick={() => openFile(f)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFile(f); } }}>
        <span className={`me-ficon ${kind}`} style={{ width: 42, height: 42 }}><Icon size={19} /></span>
        <b>{f.title || f.file_name}</b>
        <small>{extOf(f)} · {fmtSize(f.size_bytes)} · {fmtDate(f.created_at)}</small>
        <div className="me-fact" onClick={(e) => e.stopPropagation()}>
          <button className="me-iconact" title="Descargar" onClick={() => download(f)}><Download size={14} /></button>
          <button className={`me-star ${starred.includes(f.id) ? "on" : ""}`} onClick={() => toggleStar(f.id)}><Star size={14} /></button>
          <button className="me-dots" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === f.id ? null : f.id); }}><MoreHorizontal size={15} /></button>
          {menuId === f.id && (
            <div className="me-menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setMenuId(null); openFile(f); }}><Eye size={14} /> Ver documento</button>
              <button onClick={() => { setMenuId(null); download(f); }}><Download size={14} /> Descargar</button>
              <button className="danger" onClick={() => { setMenuId(null); setModal({ type: "del-file", file: f }); }}><Trash2 size={14} /> Eliminar</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderExplorer(title) {
    return (
      <section className="me-card me-explorer">
        <header className="me-explorer-head">
          <nav className="me-crumb">
            <button onClick={() => setSelFolder(null)}><Home size={13} /></button>
            <ChevronRight size={12} />
            <button onClick={() => setSelFolder(null)}>Mis carpetas</button>
            {crumbs.map((c, i) => (
              <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <ChevronRight size={12} />
                <button className={i === crumbs.length - 1 ? "here" : ""} onClick={() => setSelFolder(c.id)}>{c.name}</button>
              </span>
            ))}
            {title && <span className="here">{title}</span>}
          </nav>
          <div className="me-explorer-actions">
            <button className="me-chip" onClick={() => { setModal({ type: "folder-new", parentId: selFolder }); setModalText(""); }}><FolderPlus size={14} /> Nueva carpeta</button>
            <button className="me-chip" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Upload size={14} /> {uploading ? "Subiendo…" : "Subir archivo"}
            </button>
            <button className="me-chip" onClick={downloadAll} disabled={!files.length}
              title={selFolder ? "Descargar esta carpeta (y subcarpetas) en ZIP" : view === "espacio" ? "Descargar los archivos de esta vista en ZIP" : "Descargar todos tus archivos en ZIP"}>
              <Download size={14} /> Descargar todo
            </button>
            <div className="me-viewtoggle">
              <button className={mode === "grid" ? "on" : ""} onClick={() => { setMode("grid"); setPref({ mode: "grid" }); }}><Grid2X2 size={14} /></button>
              <button className={mode === "list" ? "on" : ""} onClick={() => { setMode("list"); setPref({ mode: "list" }); }}><List size={14} /></button>
            </div>
          </div>
        </header>
        <p className="me-explorer-sub">Archivos en esta {view === "espacio" ? "carpeta" : "vista"}</p>
        {!visible.length ? (
          <div style={{ padding: "10px 20px 24px" }}>
            <div className="me-empty">
              <div className="ico"><FolderOpen size={24} /></div>
              <h3>Esta carpeta está lista para trabajar</h3>
              <p>Crea subcarpetas o agrega tu primer archivo con el botón «Subir archivo».</p>
            </div>
          </div>
        ) : mode === "list" ? (
          <div className="me-table">
            <div className="me-thead"><span>Nombre</span><span>Tipo</span><span>Tamaño</span><span>Modificado</span><span style={{ textAlign: "right" }}>Acciones</span></div>
            {pageFiles.map(FileRow)}
          </div>
        ) : (
          <div className="me-filegrid">{pageFiles.map(FileCard)}</div>
        )}
        {visible.length > 0 && (
          <footer className="me-explorer-foot">
            <span>Mostrando {pageFiles.length} de {visible.length} archivos</span>
            <div className="me-pager">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
              {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 5).map((n) => (
                <button key={n} className={n === page ? "on" : ""} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
            </div>
          </footer>
        )}
      </section>
    );
  }

  const kpis = [
    { icon: Folder, n: folders.length, t: "Carpetas", s: "Activas", acc: "#4f6bff", tint: "rgba(79,107,255,.13)" },
    { icon: FileText, n: files.length, t: "Archivos", s: "En total", acc: "#7c5cfc", tint: "rgba(124,92,252,.13)" },
    { icon: Star, n: totalFavs, t: "Favoritos", s: "Marcados", acc: "#eea800", tint: "rgba(238,168,0,.14)" },
    { icon: Clock, n: recientes.length, t: "Recientes", s: "Últimos 7 días", acc: "#17b8a6", tint: "rgba(23,184,166,.14)" },
  ];

  const initials = (user?.full_name || "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className={`me-shell ${vivid ? "vivid" : ""}`}>
      <input ref={fileInput} type="file" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />

      {/* ============ Sidebar ============ */}
      {menuAbierto && <div className="movil-tapa" onClick={() => setMenuAbierto(false)} />}
      <aside className={`me-sidebar${menuAbierto ? " abierto" : ""}`} onClick={() => setMenuAbierto(false)}>
        <div className="me-logo">
          <span className="me-logo-mark"><img src="/branding/logo-grupo-ingenio.png" alt="Grupo Ingenio" /></span>
          <div>
            <h1>Grupo Ingenio</h1>
            <p>Gestión documental</p>
          </div>
        </div>
        <nav className="me-nav">
          {NAV.map((item) => {
            const I = item.icon;
            const count = item.id === "carpetas" ? folders.length : item.id === "archivos" ? files.length : item.id === "favoritos" ? totalFavs : null;
            return (
              <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => setView(item.id)}>
                <I size={17} /> {item.label}
                {count != null && count > 0 && <span className="me-nav-count">{count}</span>}
              </button>
            );
          })}
          <button onClick={() => (location.href = "/")}><ArrowLeft size={17} /> Volver al repositorio</button>
        </nav>
        <div className="me-side-user">
          <span className="me-avatar">{initials}</span>
          <div className="me-side-user-meta">
            <strong>{user?.full_name}</strong>
            <span>{user?.cargo || (user?.isAdmin ? "Administrador" : "Colaborador")}</span>
            <em>En línea</em>
          </div>
        </div>
      </aside>

      {/* ============ Main ============ */}
      <div className="me-main">
        <header className="me-topbar">
          <button className="movil-menu" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"><Menu size={19} /></button>
          <div className="me-topbar-title">
            <h1>Mi espacio / Plan</h1>
            <p>Tu espacio personal para organizar y gestionar tus documentos</p>
          </div>
          <div className="me-search">
            <Search size={15} />
            <input ref={searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar archivos y carpetas..." />
            <kbd>Ctrl K</kbd>
          </div>
          <button className="me-topbtn" title="Ambiente visual" onClick={() => { setVivid(!vivid); setPref({ vivid: !vivid }); }}><Sparkles size={17} /></button>
          <div className="me-notif-wrap">
            <button className="me-topbtn" title="Notificaciones" onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen); }}>
              <Bell size={17} />{activity.length > 0 && <span className="dot" />}
            </button>
            {notifOpen && (
              <div className="me-notif" onClick={(e) => e.stopPropagation()}>
                <h4>Actividad reciente</h4>
                <div className="me-activity">
                  {activity.slice(0, 4).map((a, i) => {
                    const I = a.kind === "folder" ? Folder : KIND_ICON[a.kind] || FileText;
                    return (
                      <div className="me-activity-item" key={i}>
                        <span className={`me-ficon ${a.kind === "folder" ? "ref" : a.kind}`}><I size={14} /></span>
                        <div className="me-activity-body"><b>{a.title}</b><span>{a.action}</span></div>
                        <time>{fmtDate(a.at)}</time>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button className="me-topbtn avatar" title={user?.full_name} onClick={() => setView("ajustes")}>{initials}</button>
        </header>

        <main className="me-content">
          {/* KPIs */}
          {view !== "ajustes" && view !== "papelera" && (
            <section className="me-kpis">
              {kpis.map((k) => {
                const I = k.icon;
                return (
                  <article className="me-kpi" key={k.t} style={{ "--acc": k.acc, "--tint": k.tint }}>
                    <span className="me-kpi-ico"><I size={21} /></span>
                    <div className="me-kpi-body">
                      <strong>{k.n}</strong>
                      <b>{k.t}</b>
                      <span>{k.s}</span>
                    </div>
                    <svg className="me-kpi-spark" width="64" height="26" viewBox="0 0 64 26" fill="none">
                      <path d="M2 20 C10 20 12 8 20 12 S30 22 38 14 50 4 62 8" stroke={k.acc} strokeWidth="2" strokeLinecap="round" opacity=".8" />
                      <path d="M2 20 C10 20 12 8 20 12 S30 22 38 14 50 4 62 8 L62 26 L2 26 Z" fill={k.acc} opacity=".08" />
                    </svg>
                  </article>
                );
              })}
            </section>
          )}

          {/* ===== Vista principal: 3 columnas ===== */}
          {view === "espacio" && (
            <div className="me-columns">
              <section className="me-card">
                <header className="me-card-title">
                  <h3>Mis carpetas</h3>
                  <button className="me-addfolder" title="Nueva carpeta" onClick={() => { setModal({ type: "folder-new", parentId: null }); setModalText(""); }}><Plus size={15} /></button>
                </header>
                <div className="me-tree">
                  <div className={`me-tree-row ${selFolder === null ? "on" : ""}`} onClick={() => setSelFolder(null)}>
                    <span className="me-tree-caret"><i /></span>
                    <FolderOpen size={15} />
                    <span className="me-tree-name">Todos mis documentos</span>
                    <span className="me-tree-count">{filesIn(null).length}</span>
                  </div>
                  {childrenOf(null).map((f) => renderTree(f))}
                </div>
                <footer className="me-tree-foot"><Folder size={13} /> Total: {folders.length} carpetas</footer>
              </section>

              {renderExplorer()}

              <aside className="me-right">
                <section className="me-card">
                  <header className="me-card-title">
                    <h3>Actividad reciente</h3>
                    <button className="link" onClick={() => setView("archivos")}>Ver todo</button>
                  </header>
                  <div className="me-activity">
                    {activity.length ? activity.map((a, i) => {
                      const I = a.kind === "folder" ? Folder : KIND_ICON[a.kind] || FileText;
                      return (
                        <div className="me-activity-item" key={i}>
                          <span className={`me-ficon ${a.kind === "folder" ? "ref" : a.kind}`}><I size={14} /></span>
                          <div className="me-activity-body"><b>{a.title}</b><span>{a.action}</span></div>
                          <time>{fmtDate(a.at)}</time>
                        </div>
                      );
                    }) : <p style={{ fontSize: 12.5, color: "var(--me-muted)", margin: 0 }}>Aún no hay movimientos en tu espacio.</p>}
                  </div>
                </section>

                <section className="me-card">
                  <header className="me-card-title"><h3>Detalles de carpeta</h3></header>
                  <div className="me-details-hero">
                    <span className="ico"><FolderOpen size={19} /></span>
                    <div>
                      <b>{detailFolder ? detailFolder.name : "Todos mis documentos"}</b>
                      <span>{detailFolder ? "Carpeta personal" : "Raíz de tu espacio"}</span>
                    </div>
                  </div>
                  <p className="me-details-desc">
                    <em>Descripción</em>
                    {detailFolder
                      ? `Organización y documentos personales de «${detailFolder.name}».`
                      : "Vista general de los documentos que no pertenecen a ninguna carpeta."}
                  </p>
                  <div className="me-detail-row"><span>Cantidad de archivos</span><b>{detailFiles.length} archivos</b></div>
                  <div className="me-detail-row"><span>Última modificación</span><b>{lastMod ? fmtDate(lastMod) : "—"}</b></div>
                  <div className="me-detail-row"><span>Creada el</span><b>{detailFolder ? fmtDate(detailFolder.created_at) : "—"}</b></div>
                </section>

                <section className="me-card">
                  <header className="me-card-title">
                    <h3>Filtros rápidos</h3>
                    <button className="link" onClick={() => setFilters({ type: "", date: "", fav: "" })}>Limpiar</button>
                  </header>
                  <div className="me-filters">
                    <label>Tipo de archivo
                      <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                        <option value="">Todos los tipos</option>
                        {extOptions.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </label>
                    <label>Fecha de modificación
                      <select value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })}>
                        <option value="">Cualquier fecha</option>
                        <option value="hoy">Hoy</option>
                        <option value="7">Últimos 7 días</option>
                        <option value="30">Últimos 30 días</option>
                      </select>
                    </label>
                    <label>Estado favorito
                      <select value={filters.fav} onChange={(e) => setFilters({ ...filters, fav: e.target.value })}>
                        <option value="">Todos</option>
                        <option value="si">Solo favoritos</option>
                      </select>
                    </label>
                  </div>
                </section>
              </aside>
            </div>
          )}

          {/* ===== Carpetas ===== */}
          {view === "carpetas" && (
            <div className="me-single">
              <section className="me-card">
                <header className="me-card-title">
                  <h3>Todas tus carpetas</h3>
                  <button className="me-chip" onClick={() => { setModal({ type: "folder-new", parentId: null }); setModalText(""); }}><FolderPlus size={14} /> Nueva carpeta</button>
                </header>
                {folders.length ? (
                  <div className="me-foldergrid">
                    {folders
                      .filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase()))
                      .map((f) => (
                        <button className="me-foldercard" key={f.id} onClick={() => { setSelFolder(f.id); setView("espacio"); }}>
                          <span className="ico"><Folder size={19} /></span>
                          <b>{f.name}</b>
                          <span>{filesIn(f.id).length} archivos · {fmtDate(f.created_at)}</span>
                        </button>
                      ))}
                  </div>
                ) : (
                  <div className="me-empty">
                    <div className="ico"><FolderPlus size={24} /></div>
                    <h3>Crea tu primera carpeta</h3>
                    <p>Organiza tu plan de trabajo, contratos, actas y recursos personales.</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ===== Archivos / Favoritos ===== */}
          {view === "archivos" && <div className="me-single">{renderExplorer("Todos los archivos")}</div>}
          {view === "favoritos" && (
            <div className="me-single">
              {renderExplorer("Favoritos")}
              {repoFavs.length > 0 && (
                <section className="me-card">
                  <header className="me-card-title"><h3>Favoritos del repositorio institucional</h3></header>
                  <div className="me-foldergrid">
                    {repoFavs.map((d) => (
                      <button className="me-foldercard" key={d.id} onClick={() => window.open(`/api/documents/${d.document_id}/file`, "_blank")}>
                        <span className="ico" style={{ color: "#eea800", background: "rgba(238,168,0,.13)" }}><Star size={18} /></span>
                        <b>{d.name}</b>
                        <span>{d.code}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ===== Papelera ===== */}
          {view === "papelera" && (
            <div className="me-single">
              <section className="me-card">
                <header className="me-card-title">
                  <h3>Papelera</h3>
                  {trashLog.length > 0 && <button className="link" onClick={() => { setTrashLog([]); saveLS("me-trash-log", []); }}>Vaciar registro</button>}
                </header>
                {trashLog.length ? (
                  <>
                    <p style={{ fontSize: 12.5, color: "var(--me-muted)", margin: "0 0 12px" }}>
                      Los archivos eliminados se retiran de forma permanente. Este es el registro de tus últimas eliminaciones.
                    </p>
                    <div className="me-activity">
                      {trashLog.map((t, i) => (
                        <div className="me-activity-item" key={i}>
                          <span className="me-ficon otro"><Trash2 size={14} /></span>
                          <div className="me-activity-body"><b>{t.title}</b><span>{t.ext} · Eliminado permanentemente</span></div>
                          <time>{fmtDate(t.at)}</time>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="me-empty">
                    <div className="ico"><Trash2 size={24} /></div>
                    <h3>La papelera está vacía</h3>
                    <p>Cuando elimines archivos de tu espacio, aquí quedará el registro.</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ===== Ajustes ===== */}
          {view === "ajustes" && (
            <div className="me-single">
              <section className="me-card">
                <header className="me-card-title"><h3>Ajustes de tu espacio</h3></header>
                <div className="me-settings">
                  <div className="me-setting">
                    <div><b>Vista predeterminada</b><span>Cómo se muestran tus archivos al entrar</span></div>
                    <div className="me-seg">
                      <button className={mode === "list" ? "on" : ""} onClick={() => { setMode("list"); setPref({ mode: "list" }); }}>Lista</button>
                      <button className={mode === "grid" ? "on" : ""} onClick={() => { setMode("grid"); setPref({ mode: "grid" }); }}>Cuadrícula</button>
                    </div>
                  </div>
                  <div className="me-setting">
                    <div><b>Ambiente visual</b><span>Intensidad de los degradados del fondo</span></div>
                    <div className="me-seg">
                      <button className={!vivid ? "on" : ""} onClick={() => { setVivid(false); setPref({ vivid: false }); }}>Sereno</button>
                      <button className={vivid ? "on" : ""} onClick={() => { setVivid(true); setPref({ vivid: true }); }}>Vivo</button>
                    </div>
                  </div>
                  <div className="me-setting">
                    <div><b>Sesión</b><span>{user?.full_name} · {user?.email || "Cuenta activa"}</span></div>
                    <button className="me-btn ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; }}>
                      <LogOut size={14} /> Cerrar sesión
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* ============ Modales ============ */}
      {modal && (
        <div className="me-overlay" onClick={() => setModal(null)}>
          <div className="me-modal" onClick={(e) => e.stopPropagation()}>
            {modal.type === "folder-new" && (
              <>
                <h3>Nueva carpeta</h3>
                <p>{modal.parentId ? `Se creará dentro de «${folderById(modal.parentId)?.name}».` : "Se creará en la raíz de tu espacio."}</p>
                <input autoFocus value={modalText} onChange={(e) => setModalText(e.target.value)} placeholder="Nombre de la carpeta"
                  onKeyDown={(e) => { if (e.key === "Enter" && modalText.trim()) { createFolder(modalText.trim(), modal.parentId); setModal(null); } }} />
                <div className="me-modal-foot">
                  <button className="me-btn ghost" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="me-btn primary" disabled={!modalText.trim()} onClick={() => { createFolder(modalText.trim(), modal.parentId); setModal(null); }}><FolderPlus size={14} /> Crear</button>
                </div>
              </>
            )}
            {modal.type === "folder-rename" && (
              <>
                <h3>Renombrar carpeta</h3>
                <p>Escribe el nuevo nombre para esta carpeta.</p>
                <input autoFocus value={modalText} onChange={(e) => setModalText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && modalText.trim()) { renameFolder(modal.id, modalText.trim()); setModal(null); } }} />
                <div className="me-modal-foot">
                  <button className="me-btn ghost" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="me-btn primary" disabled={!modalText.trim()} onClick={() => { renameFolder(modal.id, modalText.trim()); setModal(null); }}><Check size={14} /> Guardar</button>
                </div>
              </>
            )}
            {modal.type === "del-folder" && (
              <>
                <h3>Eliminar carpeta</h3>
                <p>
                  ¿Eliminar «{modal.name}»?
                  {(() => {
                    const { subcarpetas, archivos } = contentsOf(modal.id);
                    if (!subcarpetas && !archivos) return " La carpeta está vacía.";
                    const partes = [];
                    if (subcarpetas) partes.push(`${subcarpetas} subcarpeta${subcarpetas > 1 ? "s" : ""}`);
                    if (archivos) partes.push(`${archivos} archivo${archivos > 1 ? "s" : ""}`);
                    return ` Se eliminarán también ${partes.join(" y ")}. Esta acción es permanente.`;
                  })()}
                </p>
                <div className="me-modal-foot">
                  <button className="me-btn ghost" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="me-btn danger" onClick={() => { deleteFolder(modal.id); setModal(null); }}><Trash2 size={14} /> Eliminar</button>
                </div>
              </>
            )}
            {modal.type === "del-file" && (
              <>
                <h3>Eliminar archivo</h3>
                <p>¿Eliminar «{modal.file.title || modal.file.file_name}» de tu espacio? Esta acción es permanente.</p>
                <div className="me-modal-foot">
                  <button className="me-btn ghost" onClick={() => setModal(null)}>Cancelar</button>
                  <button className="me-btn danger" onClick={() => { deleteFile(modal.file); setModal(null); }}><Trash2 size={14} /> Eliminar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`me-toast ${toast.tipo === "error" ? "error" : ""}`}>
          {toast.tipo === "error" ? <AlertCircle size={15} /> : <Check size={15} />} {toast.msg}
        </div>
      )}
      <EmbeddedFileViewer item={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

