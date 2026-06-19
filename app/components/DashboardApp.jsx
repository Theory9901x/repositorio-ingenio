"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BriefcaseBusiness, Building2, FileSearch, FileText,
  Grid2X2, LogOut, Map, MessageCircle, Search, Settings, ShieldCheck, UserRound, X,
} from "lucide-react";
import AdminDocumentPanel from "./AdminDocumentPanel";
import ContractRoutesPanel from "./ContractRoutesPanel";
import ProcessDetailView from "./ProcessDetailView";
import WorkspacePanel from "./WorkspacePanel";
import ProfilePanel from "./ProfilePanel";
import CommunityPanel from "./CommunityPanel";
import AdminContentPanel from "./AdminContentPanel";

const TIERS = [
  ["estrategico", "Procesos estratégicos", "#0017E8"],
  ["misional", "Procesos misionales", "#22AFC8"],
  ["apoyo", "Procesos de apoyo", "#101A63"],
  ["evaluacion", "Procesos de evaluación", "#6477C8"],
];
const SECTION_TITLES = { consultation: "Consulta documental", workspace: "Mi espacio / Plan", contracts: "Contratos / Rutas", community:"Comunidad", profile:"Mi perfil", admin: "Administración" };
const initialAuth = { full_name: "", cedula: "", email: "", password: "", cargo: "" };

async function readJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "No fue posible completar la solicitud");
  return data;
}

export default function DashboardApp() {
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState("consultation");
  const [processes, setProcesses] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("cards");
  const [mapFailed, setMapFailed] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  const loadUser = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const nextUser = response.ok ? await response.json() : null;
    setUser(nextUser || null);
    return nextUser;
  }, []);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    setDataError("");
    try {
      const responses = await Promise.all([
        fetch("/api/processes", { cache: "no-store" }),
        fetch("/api/doctypes", { cache: "no-store" }),
        fetch("/api/documents", { cache: "no-store" }),
      ]);
      const [nextProcesses, nextTypes, rawDocs] = await Promise.all(responses.map(readJson));
      setProcesses(Array.isArray(nextProcesses) ? nextProcesses : []);
      setDocTypes(Array.isArray(nextTypes) ? nextTypes : []);
      setDocs(Array.isArray(rawDocs) ? rawDocs.map((x) => ({
        ...x,
        processId: x.process_id,
        typeId: x.type_id,
        isPublic: !!x.is_public,
        hasFile: !!x.has_file,
        file: x.file_name || "",
        due: x.due_date || "",
      })) : []);
    } catch (error) {
      setDataError(error.message || "No fue posible cargar el repositorio");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { loadUser().catch(() => setUser(null)); }, [loadUser]);
  useEffect(() => { if (user) loadAll(); }, [user, loadAll]);
  useEffect(() => { if (!user?.isAdmin && section === "admin") setSection("consultation"); }, [user, section]);

  const procById = useCallback((id) => processes.find((p) => Number(p.id) === Number(id)), [processes]);
  const typeById = useCallback((id) => docTypes.find((t) => Number(t.id) === Number(id)), [docTypes]);
  const countFor = useCallback((processId) => docs.filter((d) => Number(d.processId) === Number(processId)).length, [docs]);
  const matchingProcesses = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return processes;
    const processIds = new Set(docs.filter((doc) => {
      const process = procById(doc.processId);
      const type = typeById(doc.typeId);
      return [doc.code, doc.name, doc.file, process?.name, process?.sigla, type?.name, type?.sigla]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
    }).map((doc) => Number(doc.processId)));
    return processes.filter((process) => processIds.has(Number(process.id)) ||
      [process.name, process.sigla].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [query, processes, docs, procById, typeById]);

  if (user === undefined) return <div className="loading"><span className="loader" /> Cargando Grupo Ingenio…</div>;
  if (!user) return <AuthScreen onAuthenticated={async () => { const me = await loadUser(); if (me) await loadAll(); }} />;

  function navigate(next) { setSection(next); setSelectedProcess(null); setDetail(null); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setDocs([]); }

  const navItems = [
    ["consultation", FileSearch, "Consulta documental"],
    ["workspace", UserRound, "Mi espacio / Plan"],
    ["contracts", BriefcaseBusiness, "Contratos / Rutas"],
    ["community", MessageCircle, "Comunidad"],
    ["profile", UserRound, "Mi perfil"],
    ...(user.isAdmin ? [["admin", Settings, "Administración"]] : []),
  ];

  return <div className="shell">
    <aside className="sidebar">
      <div className="side-brand"><div className="brand-mark"><Building2 size={25} /></div><div><h1>Grupo Ingenio</h1><p>Gestión documental</p></div></div>
      <nav className="side-nav" aria-label="Navegación principal">{navItems.map(([id, Icon, label]) => <button key={id} className={section === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={18} /> {label}</button>)}</nav>
      <div className="side-block"><span className="side-label">Repositorio institucional</span><div className="soon"><FileText size={16} /> {docs.length} documentos</div><div className="soon"><ShieldCheck size={16} /> Acceso seguro</div></div>
      <div className="user-card"><div className="avatar">{(user.full_name || user.email || "U").charAt(0).toUpperCase()}</div><div className="user-meta"><strong>{user.full_name || user.email}</strong><span>{user.cargo || "Usuario"}</span>{user.isAdmin && <em><ShieldCheck size={11} /> Administrador</em>}</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="top-title"><span className="eyebrow mini">Repositorio Ingenio</span><strong>{selectedProcess ? selectedProcess.name : SECTION_TITLES[section]}</strong></div><div className="top-actions"><button className="chip-btn" onClick={loadAll} disabled={loadingData}>Actualizar</button><button className="chip-btn danger-lite" onClick={logout}><LogOut size={16} /> Salir</button></div></header>
      <div className="wrap dashboard-wrap">
        {dataError && <div className="error-banner">{dataError}<button onClick={loadAll}>Reintentar</button></div>}
        {section === "consultation" && (selectedProcess
          ? <ProcessDetailView process={selectedProcess} docs={docs} docTypes={docTypes} onBack={() => setSelectedProcess(null)} onOpenDoc={setDetail} />
          : <Consultation processes={matchingProcesses} docs={docs} query={query} setQuery={setQuery} view={view} setView={setView} countFor={countFor} onOpen={setSelectedProcess} mapFailed={mapFailed} setMapFailed={setMapFailed} />)}
        {section === "workspace" && <WorkspacePanel docs={docs} procById={procById} typeById={typeById} setDetail={setDetail} />}
        {section === "contracts" && <ContractRoutesPanel user={user} />}
        {section === "community" && <CommunityPanel user={user} />}
        {section === "profile" && <ProfilePanel user={user} onChanged={loadUser} />}
        {section === "admin" && user.isAdmin && <><AdminContentPanel processes={processes} onChanged={loadAll}/><AdminDocumentPanel docs={docs} processes={processes} docTypes={docTypes} procById={procById} typeById={typeById} onChanged={loadAll} /></>}
      </div>
    </main>
    {detail && <DocumentViewer doc={detail} procById={procById} typeById={typeById} onClose={() => setDetail(null)} />}
  </div>;
}

function Consultation({ processes, docs, query, setQuery, view, setView, countFor, onOpen, mapFailed, setMapFailed }) {
  return <section className="section dashboard-section">
    <div className="hero-panel"><div className="hero-copy"><div className="eyebrow">Sistema integrado de gestión</div><h2>La documentación de cada proceso, en un solo lugar.</h2><p>Busca por código, nombre, archivo, proceso, sigla o tipo documental; luego entra a la ficha completa del proceso.</p></div><div className="hero-search-card"><div className="searchbar hero-search"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en todo el repositorio…" /></div></div><div className="stats-grid"><div className="stat-card"><strong>{processes.length}</strong><span>Procesos visibles</span></div><div className="stat-card"><strong>{docs.length}</strong><span>Documentos</span></div><div className="stat-card"><strong>{docs.filter((d) => d.state === "vigente").length}</strong><span>Vigentes</span></div><div className="stat-card"><strong>{docs.filter((d) => d.hasFile).length}</strong><span>Con archivo</span></div></div></div>
    <div className="section-title-row"><div><div className="eyebrow">Arquitectura de procesos</div><h2 className="h2">Mapa documental</h2></div><div className="view-toggle"><button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}><Grid2X2 size={16} /> Vista tarjetas</button><button className={view === "map" ? "on" : ""} onClick={() => setView("map")}><Map size={16} /> Vista mapa interactivo</button></div></div>
    {view === "cards" ? <ProcessGroups processes={processes} countFor={countFor} onOpen={onOpen} /> : <InteractiveMap processes={processes} countFor={countFor} onOpen={onOpen} failed={mapFailed} setFailed={setMapFailed} />}
    {!processes.length && <div className="empty-state"><h3>Sin coincidencias</h3><p>Prueba con otro código, nombre, proceso o tipo documental.</p></div>}
  </section>;
}

function ProcessGroups({ processes, countFor, onOpen }) {
  return TIERS.map(([tier, label, color]) => { const items = processes.filter((p) => p.tier === tier); if (!items.length) return null; return <div className="tier" key={tier}><div className="tier-head"><i className="tier-bar" style={{ background: color }} /><h3>{label}</h3><span>{items.length} procesos</span></div><div className="grid">{items.map((process) => <ProcessCard key={process.id} process={process} color={color} count={countFor(process.id)} onOpen={onOpen} />)}</div></div>; });
}

function ProcessCard({ process, color, count, onOpen }) { return <button className="pcard" onClick={() => onOpen(process)}><i className="edge" style={{ background: color }} /><span className="sig">{process.sigla}</span><h4>{process.name}</h4><span className="meta"><span className="count">{count} documentos</span><span className="go">Abrir proceso <ArrowRight size={14} /></span></span></button>; }

function InteractiveMap({ processes, countFor, onOpen, failed, setFailed }) {
  return <div className="process-map"><div className="map-canvas">{!failed && <img src="/branding/mapa-procesos-grupo-ingenio.png" alt="Mapa de procesos de Grupo Ingenio" onError={() => setFailed(true)} />}{failed && <div className="map-fallback"><Map size={36} /><strong>Mapa navegable por categorías</strong><span>La imagen institucional aún no está disponible; todos los procesos siguen accesibles.</span></div>}</div><div className="map-layers">{TIERS.map(([tier, label, color]) => { const items = processes.filter((p) => p.tier === tier); if (!items.length) return null; return <div className="map-layer" key={tier} style={{ "--layer": color }}><h3>{label}</h3><div>{items.map((process) => <button key={process.id} onClick={() => onOpen(process)}><b>{process.sigla}</b><span>{process.name}</span><em>{countFor(process.id)}</em></button>)}</div></div>; })}</div></div>;
}

function DocumentViewer({ doc, procById, typeById, onClose }) {
  const url = `/api/documents/${doc.id}/file`;
  const name = doc.file || doc.file_name || "";
  const previewable = /\.(pdf|png|jpe?g|gif|webp|svg)$/i.test(name);
  return <div className="overlay" onClick={onClose}><article className="modal viewer-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow mini">Ficha técnica documental</span><h3>{doc.name}</h3></div><button className="iconbtn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div><div className="modal-body"><div className="doc-detail-hero"><FileText size={30} /><div><span className="code">{doc.code || "SIN CÓDIGO"}</span><strong>{doc.name}</strong></div></div><div className="viewer-info"><div><span>Proceso</span><b>{procById(doc.processId || doc.process_id)?.name || "Sin proceso"}</b></div><div><span>Tipo documental</span><b>{typeById(doc.typeId || doc.type_id)?.name || "Sin tipo"}</b></div><div><span>Estado</span><b>{doc.state || "—"}</b></div><div><span>Versión</span><b>{doc.version ? `V ${doc.version}` : "—"}</b></div><div className="full"><span>Archivo</span><b>{name || "Sin archivo asociado"}</b></div></div>{doc.hasFile || doc.has_file ? <><a className="btn btn-primary viewer-open" href={url} target="_blank" rel="noreferrer">Abrir / descargar</a>{previewable ? <div className="viewer-preview"><iframe src={url} title={`Vista previa de ${doc.name}`} /></div> : <p className="note">Este tipo de archivo no admite vista previa en el navegador. Usa “Abrir / descargar”.</p>}</> : <p className="note">Este registro todavía no tiene un archivo asociado.</p>}</div></article></div>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialAuth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      await readJson(response);
      if (mode === "register") { const login = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, password: form.password }) }); await readJson(login); }
      await onAuthenticated();
    } catch (submitError) { setError(submitError.message); } finally { setBusy(false); }
  }
  const field = (name, label, type = "text") => <div className="field"><label>{label}</label><input required type={type} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></div>;
  return <main className="auth-shell"><section className="auth-visual"><div className="auth-brand"><Building2 size={34} /> Grupo Ingenio</div><h1>Documentos que acompañan el trabajo.</h1><p>Consulta procesos, organiza tu plan, aporta evidencias y administra el conocimiento institucional desde un mismo dashboard.</p></section><section className="auth-card"><div className="tabs auth-tabs"><button className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>Iniciar sesión</button><button className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setError(""); }}>Crear cuenta</button></div><form className="form-stack" onSubmit={submit}>{mode === "register" && <>{field("full_name", "Nombre completo")}{field("cedula", "Cédula")}</>}{field("email", "Correo electrónico", "email")}{field("password", "Contraseña", "password")}{mode === "register" && field("cargo", "Cargo")}{error && <div className="err">{error}</div>}<button className="btn btn-primary auth-submit" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar al dashboard" : "Registrar y entrar"}</button></form></section></main>;
}
