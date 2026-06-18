"use client";

import { useEffect, useState } from "react";
import { Briefcase, ChevronDown, ChevronRight, Download, FileText, Folder, FolderOpen, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";

const SECTIONS = [
  { id: "workplan", label: "Mi plan de trabajo", icon: Briefcase },
  { id: "personal", label: "Carpetas personales", icon: Folder },
  { id: "favorites", label: "Favoritos", icon: Star },
];

export default function WorkspacePanel({ docs = [], procById = () => null, typeById = () => null, setDetail = () => {} }) {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [section, setSection] = useState("workplan");
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [open, setOpen] = useState({});
  const [repoDoc, setRepoDoc] = useState("");
  const [fileObj, setFileObj] = useState(null);
  const [title, setTitle] = useState("");

  async function load() {
    const [f, fl, fav] = await Promise.all([
      fetch("/api/workspace/folders").then((r) => r.json()),
      fetch("/api/workspace/files").then((r) => r.json()),
      fetch("/api/favorites").then((r) => r.json()),
    ]);
    setFolders(Array.isArray(f) ? f : []);
    setFiles(Array.isArray(fl) ? fl : []);
    setFavorites(Array.isArray(fav) ? fav : []);
  }

  useEffect(() => { load(); }, []);

  async function newFolder(parentId = null) {
    const name = window.prompt("Nombre de la carpeta");
    if (!name) return;
    await fetch("/api/workspace/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId, section }),
    });
    await load();
  }

  async function renameFolder(id, oldName) {
    const name = window.prompt("Nuevo nombre", oldName);
    if (!name) return;
    await fetch(`/api/workspace/folders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await load();
  }

  async function deleteFolder(id) {
    if (!window.confirm("Solo se eliminan carpetas vacías. ¿Continuar?")) return;
    const r = await fetch(`/api/workspace/folders/${id}`, { method: "DELETE" });
    if (!r.ok) window.alert((await r.json()).error || "No se pudo eliminar");
    await load();
  }

  async function uploadPersonal() {
    if (!fileObj) return window.alert("Selecciona un archivo");
    const fd = new FormData();
    fd.append("source", "personal");
    if (selectedFolder) fd.append("folderId", selectedFolder);
    if (title) fd.append("title", title);
    fd.append("file", fileObj);
    await fetch("/api/workspace/files", { method: "POST", body: fd });
    setFileObj(null);
    setTitle("");
    await load();
  }

  async function saveReference() {
    if (!repoDoc) return;
    const fd = new FormData();
    fd.append("source", "repo_reference");
    fd.append("repoDocumentId", repoDoc);
    if (selectedFolder) fd.append("folderId", selectedFolder);
    await fetch("/api/workspace/files", { method: "POST", body: fd });
    setRepoDoc("");
    await load();
  }

  async function deleteFile(id) {
    if (!window.confirm("¿Eliminar de tu espacio?")) return;
    await fetch(`/api/workspace/files/${id}`, { method: "DELETE" });
    await load();
  }

  async function addFavorite(id) {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id }),
    });
    await load();
  }

  const currentFolders = folders.filter((f) => f.section === section);
  const root = currentFolders.filter((f) => !f.parent_id);
  const currentFiles = files.filter((f) => selectedFolder ? f.folder_id === selectedFolder : !f.folder_id);
  const selectedName = folders.find((f) => f.id === selectedFolder)?.name || SECTIONS.find((s) => s.id === section)?.label;

  function renderFolder(f, level = 0) {
    const children = currentFolders.filter((x) => x.parent_id === f.id);
    const isOpen = open[f.id] !== false;
    return (
      <div key={f.id}>
        <div className={"tree-row " + (selectedFolder === f.id ? "on" : "")} style={{ paddingLeft: 12 + level * 16 }}>
          <button onClick={() => setOpen({ ...open, [f.id]: !isOpen })}>{children.length ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}</button>
          <span onClick={() => setSelectedFolder(f.id)}><Folder size={15} /> {f.name}</span>
          <button onClick={() => newFolder(f.id)}><Plus size={13} /></button>
          <button onClick={() => renameFolder(f.id, f.name)}><Pencil size={13} /></button>
          <button onClick={() => deleteFolder(f.id)}><Trash2 size={13} /></button>
        </div>
        {isOpen && children.map((c) => renderFolder(c, level + 1))}
      </div>
    );
  }

  return (
    <section className="section dashboard-section">
      <div className="workspace-hero">
        <div>
          <div className="eyebrow"><Briefcase size={14} /> Mi espacio / Plan de trabajo</div>
          <h2 className="h2">Carpetas personales, favoritos y documentos de trabajo</h2>
          <p className="lead">Organiza documentos propios, guarda referencias del repositorio institucional y estructura tu plan de trabajo.</p>
        </div>
        <button className="btn btn-primary" onClick={() => newFolder(null)}><Plus size={16} /> Nueva carpeta</button>
      </div>
      <div className="workspace-layout">
        <aside className="workspace-tree">
          <div className="workspace-tabs">{SECTIONS.map((s) => { const Icon = s.icon; return <button key={s.id} className={section === s.id ? "on" : ""} onClick={() => { setSection(s.id); setSelectedFolder(null); }}><Icon size={15} /> {s.label}</button>; })}</div>
          <div className="tree-root" onClick={() => setSelectedFolder(null)}><FolderOpen size={16} /> {SECTIONS.find((s) => s.id === section)?.label}</div>
          {root.length ? root.map((f) => renderFolder(f)) : <div className="tree-empty">Crea tu primera carpeta.</div>}
        </aside>
        <main className="workspace-content">
          <div className="workspace-head"><div><span className="eyebrow mini">Ubicación actual</span><h3>{selectedName}</h3></div><button className="btn btn-ghost" onClick={() => newFolder(selectedFolder)}><Folder size={15} /> Subcarpeta</button></div>
          <div className="upload-panel"><div className="field"><label>Subir documento personal</label><input type="text" placeholder="Título opcional" value={title} onChange={(e) => setTitle(e.target.value)} /></div><div className="field"><label>Archivo</label><input type="file" onChange={(e) => setFileObj(e.target.files?.[0] || null)} /></div><button className="btn btn-primary" onClick={uploadPersonal}><Upload size={16} /> Subir</button></div>
          <div className="upload-panel compact"><select className="sel" value={repoDoc} onChange={(e) => setRepoDoc(e.target.value)}><option value="">Guardar documento del repositorio en este espacio…</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select><button className="btn btn-ghost" onClick={saveReference}><FileText size={16} /> Guardar referencia</button></div>
          {section === "favorites" && <div className="doc-grid">{favorites.map((f) => <button className="doc-card" key={f.id} onClick={() => setDetail({ ...f, id: f.document_id, processId: f.process_id, typeId: f.type_id, hasFile: f.has_file, file: f.file_name })}><div className="doc-icon"><Star size={20} /></div><span className="code">{f.code}</span><h4>{f.name}</h4><p>{procById(f.process_id)?.name}</p></button>)}</div>}
          <div className="doc-grid">{currentFiles.map((f) => <div className="doc-card" key={f.id}><div className="doc-icon"><FileText size={20} /></div><span className="code">{f.source === "repo_reference" ? f.repo_code : "PERSONAL"}</span><h4>{f.title}</h4><p>{f.source === "repo_reference" ? `${procById(f.process_id)?.name || "Repositorio"} · ${typeById(f.type_id)?.name || "Documento"}` : f.file_name}</p><div className="doc-card-foot">{f.source === "personal" ? <a className="view-link" href={`/api/workspace/files/${f.id}/file`}><Download size={14} /> Descargar</a> : <span className="view-link">Referencia</span>}<button className="iconbtn danger" onClick={() => deleteFile(f.id)}><Trash2 size={14} /></button></div></div>)}</div>
          {!currentFiles.length && section !== "favorites" && <div className="empty-state"><h3>Sin documentos en esta carpeta</h3><p>Sube un archivo personal o guarda una referencia del repositorio.</p></div>}
        </main>
      </div>
      <div className="workspace-suggestions"><h3>Agregar favoritos rápidos</h3><div className="doc-grid">{docs.slice(0, 6).map((d) => <button className="doc-card mini-doc" key={d.id} onClick={() => addFavorite(d.id)}><Star size={16} /><span className="code">{d.code}</span><strong>{d.name}</strong></button>)}</div></div>
    </section>
  );
}
