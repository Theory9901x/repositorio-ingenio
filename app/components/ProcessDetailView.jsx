"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, FileClock, FileText, Folder, FolderOpen, Inbox, Pencil, Plus, Search, Trash2, X } from "lucide-react";

const TIER_LABELS = { estrategico: "Estratégico", misional: "Misional", apoyo: "Apoyo", evaluacion: "Evaluación" };
const STATES = { vigente: "Vigente", no_publicado: "No publicado", obsoleto: "Obsoleto", anulado: "Anulado" };

export default function ProcessDetailView({ process, docs = [], docTypes = [], user = null, onChanged = async () => {}, onBack = () => {}, onOpenDoc = () => {} }) {
  const [tab, setTab] = useState("general");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({});
  const [mode, setMode] = useState("produccion");
  const canEdit = !!user?.isAdmin;
  const editing = canEdit && mode === "edicion";

  const processDocs = useMemo(() => docs.filter((doc) => Number(doc.processId) === Number(process?.id)), [docs, process?.id]);
  const visibleDocs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return processDocs;
    return processDocs.filter((doc) => [doc.code, doc.name, doc.file].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [processDocs, query]);
  const grouped = docTypes.map((type) => ({ type, items: visibleDocs.filter((doc) => Number(doc.typeId) === Number(type.id)) })).filter((group) => group.items.length);

  if (!process) return null;
  return <section className="section dashboard-section process-detail-view">
    <div className="crumb premium-crumb"><button onClick={onBack}><ArrowLeft size={15} /> Volver a procesos</button><ChevronRight size={14} /><span>{process.name}</span>
      {canEdit && <div className="edit-toggle"><button className={mode === "produccion" ? "on" : ""} onClick={() => setMode("produccion")}>Producción</button><button className={mode === "edicion" ? "on" : ""} onClick={() => setMode("edicion")}><Pencil size={13} /> Edición</button></div>}
    </div>
    <div className="process-sheet-hero"><div className="process-logo-box"><FolderOpen size={30} /></div><div className="process-sheet-main"><div className="eyebrow">Caracterización del proceso</div><h2>{process.name}</h2><p>Ficha institucional y documentación controlada del proceso.</p></div><div className="process-code-box"><b>Código / sigla</b><span>{process.sigla || "—"}</span><b>Clasificación</b><span>{TIER_LABELS[process.tier] || process.tier}</span></div></div>
    <div className="process-tabs" role="tablist"><button className={tab === "general" ? "on" : ""} onClick={() => setTab("general")}>General</button><button className={tab === "caracterizacion" ? "on" : ""} onClick={() => setTab("caracterizacion")}>Caracterización</button><button className={tab === "documentacion" ? "on" : ""} onClick={() => setTab("documentacion")}>Documentación ({processDocs.length})</button></div>
    {tab === "general" && <GeneralProcess process={process} docs={processDocs} />}
    {tab === "caracterizacion" && (editing
      ? <CharacterizationEditor process={process} onChanged={onChanged} />
      : <Characterization process={process} />)}
    {tab === "documentacion" && <DocumentacionTab process={process} docTypes={docTypes} grouped={grouped} query={query} setQuery={setQuery} open={open} setOpen={setOpen} editing={editing} onChanged={onChanged} onOpenDoc={onOpenDoc} />}
  </section>;
}

function GeneralProcess({ process, docs }) {
  return <><div className="process-badges"><div className="process-badge"><b>{process.sigla}</b><span>Código</span></div><div className="process-badge"><b>{TIER_LABELS[process.tier] || process.tier}</b><span>Clasificación</span></div><div className="process-badge"><b>{docs.length}</b><span>Documentos</span></div><div className="process-badge"><b>{docs.filter((doc) => doc.state === "vigente").length}</b><span>Vigentes</span></div></div><Characterization process={process} /></>;
}

function Characterization({ process }) {
  if (!process.is_published) return <div className="empty-state"><span className="empty-ico"><FileClock size={24} /></span><h3>Información pendiente de publicación</h3><p>Administración aún no ha publicado la caracterización oficial de este proceso.</p></div>;
  return <div className="process-characterization"><article className="process-info-card"><h3>Objetivo</h3><p>{process.objective || "Sin información registrada."}</p></article><article className="process-info-card"><h3>Dueño del proceso</h3><p>{process.owner || "Sin información registrada."}</p></article><article className="process-info-card"><h3>Alcance</h3><p>{process.scope || "Sin información registrada."}</p></article><article className="process-info-card"><h3>Subprocesos</h3><div className="subprocess-list">{process.subprocesses?.length ? process.subprocesses.map((item) => <span key={item}>{item}</span>) : <p>Sin subprocesos registrados.</p>}</div></article></div>;
}

function CharacterizationEditor({ process, onChanged }) {
  const [form, setForm] = useState({
    name: process.name || "",
    sigla: process.sigla || "",
    tier: process.tier || "apoyo",
    objective: process.objective || "",
    owner: process.owner || "",
    scope: process.scope || "",
    subprocesses: (process.subprocesses || []).join("\n"),
    is_published: !!process.is_published,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!form.name.trim() || !form.sigla.trim()) { setErr("Nombre y sigla son obligatorios"); return; }
    setSaving(true); setErr("");
    const body = { id: process.id, sort_order: process.sort_order || 0, ...form, subprocesses: form.subprocesses.split("\n").map((s) => s.trim()).filter(Boolean) };
    const r = await fetch("/api/processes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || "No se pudo guardar"); return; }
    await onChanged();
  }

  const field = (key, label, area) => <div className="field"><label>{label}</label>{area ? <textarea value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /> : <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}</div>;

  return <div className="process-editor-inline">
    <div className="row2">{field("name", "Nombre")}{field("sigla", "Sigla")}</div>
    <div className="row2">
      <div className="field"><label>Clasificación</label><select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>{Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <label className="toggle publish-toggle"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /><Check size={14} /> Publicado para usuarios</label>
    </div>
    {field("objective", "Objetivo", true)}
    {field("owner", "Dueño del proceso")}
    {field("scope", "Alcance", true)}
    {field("subprocesses", "Subprocesos (uno por línea)", true)}
    {err && <div className="err">{err}</div>}
    <button className="btn btn-primary" disabled={saving} onClick={save}><Check size={15} /> {saving ? "Guardando…" : "Guardar cambios"}</button>
  </div>;
}

function DocumentacionTab({ process, docTypes, grouped, query, setQuery, open, setOpen, editing, onChanged, onOpenDoc }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function openNew() { setForm({ mode: "new", name: "", typeId: docTypes[0]?.id || "", state: "no_publicado", origin: "interno", isPublic: false, due: "", fileObj: null }); setErr(""); }
  function openEdit(doc) { setForm({ mode: "edit", id: doc.id, name: doc.name || "", typeId: doc.typeId || docTypes[0]?.id || "", state: doc.state || "no_publicado", origin: doc.origin || "interno", isPublic: !!doc.isPublic, due: doc.due || "", fileObj: null, newVersion: false }); setErr(""); }

  async function save() {
    if (!form.name.trim() || !form.typeId) { setErr("Nombre y tipo documental son obligatorios"); return; }
    setSaving(true); setErr("");
    const fd = new FormData();
    fd.append("name", form.name);
    fd.append("processId", process.id);
    fd.append("typeId", form.typeId);
    fd.append("state", form.state);
    fd.append("origin", form.origin);
    fd.append("isPublic", form.isPublic ? "true" : "false");
    fd.append("due", form.due || "");
    if (form.fileObj) fd.append("file", form.fileObj);
    let r;
    if (form.mode === "new") { r = await fetch("/api/documents", { method: "POST", body: fd }); }
    else { fd.append("newVersion", form.newVersion ? "true" : "false"); r = await fetch(`/api/documents/${form.id}`, { method: "PUT", body: fd }); }
    setSaving(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || "No se pudo guardar"); return; }
    setForm(null);
    await onChanged();
  }

  async function remove(doc) {
    if (!confirm(`¿Eliminar ${doc.code || doc.name}?`)) return;
    const r = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || "No se pudo eliminar"); return; }
    await onChanged();
  }

  return <div className="process-docs-panel">
    <div className="docs-panel-head">
      <div className="searchbar wide"><Search size={16} /><input placeholder="Buscar dentro de este proceso…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      {editing && <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nuevo documento</button>}
    </div>
    <div className="doc-tree">
      <div className="tree-title"><FolderOpen size={18} /> Documentación del proceso</div>
      {grouped.map((group) => {
        const isOpen = open[group.type.id] !== false;
        return <div className="doc-folder" key={group.type.id}>
          <button className="folder-line" onClick={() => setOpen({ ...open, [group.type.id]: !isOpen })}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Folder size={17} /><strong>{group.type.name}</strong><span>{group.items.length}</span></button>
          {isOpen && <div className="folder-docs">{group.items.map((doc) => <div className="tree-doc" key={doc.id}>
            <button className="tree-doc-open" onClick={() => onOpenDoc(doc)}><FileText size={17} /><span className="code">{doc.code}</span><strong>{doc.name}</strong><em>V {doc.version || "—"}</em><small className={`badge st-${doc.state}`}>{STATES[doc.state] || doc.state}</small></button>
            {editing && <span className="tree-doc-actions"><button className="iconbtn" onClick={() => openEdit(doc)} aria-label="Editar documento"><Pencil size={14} /></button><button className="iconbtn danger" onClick={() => remove(doc)} aria-label="Eliminar documento"><Trash2 size={14} /></button></span>}
          </div>)}</div>}
        </div>;
      })}
      {!grouped.length && <div className="empty-state"><span className="empty-ico"><Inbox size={24} /></span><h3>Sin documentos</h3><p>{editing ? "Agrega el primer documento de este proceso con el botón de arriba." : "No hay documentos asociados o no coinciden con la búsqueda."}</p></div>}
    </div>
    {form && <div className="overlay" onClick={() => setForm(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h3>{form.mode === "new" ? "Nuevo documento" : "Editar documento"}</h3><button className="iconbtn" onClick={() => setForm(null)}><X size={17} /></button></div>
      <div className="modal-body">
        <div className="field"><label>Nombre</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="row2">
          <div className="field"><label>Tipo documental</label><select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>{docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="field"><label>Estado</label><select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>{Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="row2">
          <div className="field"><label>Origen</label><select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}><option value="interno">Interno</option><option value="externo">Externo</option></select></div>
          <div className="field"><label>Fecha</label><input type="date" value={form.due || ""} onChange={(e) => setForm({ ...form, due: e.target.value })} /></div>
        </div>
        <div className="field"><label>Archivo</label><input type="file" onChange={(e) => setForm({ ...form, fileObj: e.target.files?.[0] || null })} /></div>
        <label className="toggle"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Visible al público</label>
        {form.mode === "edit" && <label className="toggle"><input type="checkbox" checked={form.newVersion} onChange={(e) => setForm({ ...form, newVersion: e.target.checked })} /> Subir como nueva versión</label>}
        {err && <div className="err">{err}</div>}
      </div>
      <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving} onClick={save}><Check size={16} /> Guardar</button></div>
    </div></div>}
  </div>;
}
