"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText, Folder, FolderOpen, ChevronRight, ChevronDown, Search, Plus,
  Pencil, Trash2, X, ArrowLeft, Download, Lock, Globe, Settings, Check,
  FileStack, LogOut, User, LayoutDashboard, Star, Bell, Briefcase, Sparkles,
  ShieldCheck, SlidersHorizontal, Layers3, Eye,
} from "lucide-react";

const TIERS = [
  { id: "estrategico", label: "Procesos Estratégicos", accent: "var(--navy)" },
  { id: "misional", label: "Procesos Misionales", accent: "var(--pine)" },
  { id: "apoyo", label: "Procesos de Apoyo", accent: "var(--slate)" },
  { id: "evaluacion", label: "Procesos de Evaluación", accent: "var(--clay)" },
];

const STATES = {
  vigente: { label: "Vigente", cls: "st-vigente" },
  no_publicado: { label: "No publicado", cls: "st-borrador" },
  obsoleto: { label: "Obsoleto", cls: "st-obsoleto" },
  anulado: { label: "Anulado", cls: "st-anulado" },
};

const emptyStats = { vigentes: 0, procesos: 0, tipos: 0, internos: 0 };

export default function Page() {
  const [authLoaded, setAuthLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [processes, setProcesses] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);

  const [view, setView] = useState("map");
  const [selProc, setSelProc] = useState(null);
  const [query, setQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [quickProc, setQuickProc] = useState("");
  const [quickType, setQuickType] = useState("");
  const [openFolders, setOpenFolders] = useState({});

  const [tab, setTab] = useState("vigente");
  const [fProc, setFProc] = useState("");
  const [fType, setFType] = useState("");
  const [aQuery, setAQuery] = useState("");

  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const isAdmin = user?.isAdmin === true;

  const norm = (d) => ({
    ...d,
    processId: d.process_id,
    typeId: d.type_id,
    isPublic: !!d.is_public,
    due: d.due_date || "",
    file: d.file_name || "",
    hasFile: !!d.has_file,
  });

  async function loadDocs() {
    const r = await fetch("/api/documents", { cache: "no-store" });
    setDocs((await r.json()).map(norm));
  }

  async function loadData() {
    setLoading(true);
    const [p, t] = await Promise.all([
      fetch("/api/processes").then((r) => r.json()),
      fetch("/api/doctypes").then((r) => r.json()),
    ]);
    setProcesses(p);
    setDocTypes(t);
    await loadDocs();
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      setUser(me || null);
      setAuthLoaded(true);
      if (me) await loadData();
    })();
  }, []);

  async function handleLoginSuccess() {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    setUser(me);
    await loadData();
  }

  const procById = (id) => processes.find((p) => p.id === id);
  const typeById = (id) => docTypes.find((t) => t.id === id);
  const countFor = (pid) => docs.filter((d) => d.processId === pid && d.state === "vigente").length;
  const goProcess = (p) => { setSelProc(p); setView("repo"); setQuery(""); setShowAdmin(false); };

  const stats = useMemo(() => {
    if (!docs.length && !processes.length && !docTypes.length) return emptyStats;
    return {
      vigentes: docs.filter((d) => d.state === "vigente").length,
      procesos: processes.length,
      tipos: docTypes.length,
      internos: docs.filter((d) => !d.isPublic).length,
    };
  }, [docs, processes, docTypes]);

  const globalResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    return docs
      .filter((d) => d.state !== "anulado")
      .filter((d) => (quickProc ? d.processId === Number(quickProc) : true))
      .filter((d) => (quickType ? d.typeId === Number(quickType) : true))
      .filter((d) => {
        if (!q) return true;
        const p = procById(d.processId);
        const t = typeById(d.typeId);
        return [d.name, d.code, d.origin, d.file, p?.name, p?.sigla, t?.name, t?.sigla]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
  }, [docs, globalQuery, quickProc, quickType, processes, docTypes]);

  const hasGlobalFilter = !!globalQuery.trim() || !!quickProc || !!quickType;

  const repoGroups = useMemo(() => {
    if (!selProc) return [];
    const list = docs
      .filter((d) => d.processId === selProc.id && d.state !== "anulado")
      .filter((d) => {
        if (!query) return true;
        const q = query.toLowerCase();
        const t = typeById(d.typeId);
        return [d.name, d.code, d.file, t?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
    return docTypes
      .map((t) => ({ type: t, items: list.filter((d) => d.typeId === t.id) }))
      .filter((g) => g.items.length);
  }, [docs, selProc, query, docTypes]);

  const adminRows = useMemo(() => {
    return docs
      .filter((d) => d.state === tab)
      .filter((d) => (fProc ? d.processId === Number(fProc) : true))
      .filter((d) => (fType ? d.typeId === Number(fType) : true))
      .filter((d) => {
        if (!aQuery) return true;
        const q = aQuery.toLowerCase();
        const p = procById(d.processId);
        const t = typeById(d.typeId);
        return [d.name, d.code, p?.name, t?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
  }, [docs, tab, fProc, fType, aQuery, processes, docTypes]);

  const tabCount = (s) => docs.filter((d) => d.state === s).length;

  async function handleSave(fields) {
    const fd = new FormData();
    fd.append("name", fields.name);
    fd.append("processId", fields.processId);
    fd.append("typeId", fields.typeId);
    fd.append("state", fields.state);
    fd.append("origin", fields.origin);
    fd.append("isPublic", fields.isPublic ? "true" : "false");
    fd.append("due", fields.due || "");
    if (fields.fileObj) fd.append("file", fields.fileObj);

    if (editing === "new") {
      await fetch("/api/documents", { method: "POST", body: fd });
    } else {
      fd.append("newVersion", fields.newVersion ? "true" : "false");
      await fetch(`/api/documents/${editing.id}`, { method: "PUT", body: fd });
    }
    setEditing(null);
    await loadDocs();
  }

  async function handleDelete(d) {
    if (!window.confirm(`¿Eliminar "${d.name}" (${d.code})?`)) return;
    await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    await loadDocs();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setShowAdmin(false);
  }

  if (!authLoaded) return <div className="loading"><div className="loader-dot" /> Cargando plataforma…</div>;
  if (!user) return <AuthScreen onSuccess={handleLoginSuccess} />;
  if (loading) return <div className="loading"><div className="loader-dot" /> Sincronizando repositorio…</div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          <div className="mark big">GI</div>
          <div>
            <h1>Grupo Ingenio</h1>
            <p>Gestión documental</p>
          </div>
        </div>

        <nav className="side-nav">
          <button className={!showAdmin && view === "map" ? "active" : ""} onClick={() => { setShowAdmin(false); setView("map"); }}>
            <LayoutDashboard size={17} /> Consulta documental
          </button>
          <button className={!showAdmin && view === "repo" ? "active" : ""} onClick={() => { setShowAdmin(false); if (!selProc && processes[0]) goProcess(processes[0]); }}>
            <Layers3 size={17} /> Procesos
          </button>
          {isAdmin && (
            <button className={showAdmin ? "active" : ""} onClick={() => setShowAdmin(true)}>
              <Settings size={17} /> Administración
            </button>
          )}
        </nav>

        <div className="side-block">
          <span className="side-label">Próximamente</span>
          <div className="soon"><Star size={15} /> Favoritos y carpetas</div>
          <div className="soon"><Bell size={15} /> Notificaciones</div>
          <div className="soon"><Briefcase size={15} /> Planes de trabajo</div>
        </div>

        <div className="user-card">
          <div className="avatar">{user.full_name?.[0] || "U"}</div>
          <div className="user-meta">
            <strong>{user.full_name}</strong>
            <span>{user.cargo || "Usuario"}</span>
            {isAdmin && <em><ShieldCheck size={13} /> Admin</em>}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar premium">
          <div className="top-title">
            <span className="eyebrow mini">Repositorio Documental</span>
            <strong>{showAdmin ? "Panel de administración" : "Consulta inteligente"}</strong>
          </div>
          <div className="top-actions">
            <button className="chip-btn" onClick={() => setProfileOpen(true)} title="Mi perfil">
              <User size={15} /> Perfil
            </button>
            <button className="chip-btn danger-lite" onClick={logout} title="Cerrar sesión">
              <LogOut size={15} /> Salir
            </button>
          </div>
        </header>

        <div className="wrap dashboard-wrap">
          {showAdmin && isAdmin ? (
            <AdminPanel
              docs={docs}
              processes={processes}
              docTypes={docTypes}
              adminRows={adminRows}
              tab={tab}
              setTab={setTab}
              tabCount={tabCount}
              fProc={fProc}
              setFProc={setFProc}
              fType={fType}
              setFType={setFType}
              aQuery={aQuery}
              setAQuery={setAQuery}
              procById={procById}
              typeById={typeById}
              setEditing={setEditing}
              handleDelete={handleDelete}
            />
          ) : view === "map" ? (
            <section className="section dashboard-section">
              <HeroSearch
                user={user}
                stats={stats}
                globalQuery={globalQuery}
                setGlobalQuery={setGlobalQuery}
                quickProc={quickProc}
                setQuickProc={setQuickProc}
                quickType={quickType}
                setQuickType={setQuickType}
                processes={processes}
                docTypes={docTypes}
              />

              {hasGlobalFilter ? (
                <SearchResults
                  results={globalResults}
                  procById={procById}
                  typeById={typeById}
                  setDetail={setDetail}
                  clear={() => { setGlobalQuery(""); setQuickProc(""); setQuickType(""); }}
                />
              ) : (
                <>
                  <div className="section-title-row">
                    <div>
                      <div className="eyebrow">Sistema Integrado de Gestión</div>
                      <h2 className="h2">Mapa de procesos</h2>
                      <p className="lead">Explora los procesos de la entidad y consulta manuales, procedimientos, formatos e instructivos.</p>
                    </div>
                  </div>

                  {TIERS.map((tier) => {
                    const list = processes.filter((p) => p.tier === tier.id);
                    if (!list.length) return null;
                    return (
                      <div className="tier" key={tier.id}>
                        <div className="tier-head">
                          <div className="tier-bar" style={{ background: tier.accent }} />
                          <h3>{tier.label}</h3>
                          <span>· {list.length} proceso{list.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="grid process-grid">
                          {list.map((p) => (
                            <button className="pcard premium-card" key={p.id} onClick={() => goProcess(p)}>
                              <div className="edge" style={{ background: tier.accent }} />
                              <span className="sig">{p.sigla}</span>
                              <h4>{p.name}</h4>
                              <div className="meta">
                                <span className="count"><FileStack size={14} /> {countFor(p.id)} vigentes</span>
                                <span className="go">Abrir <ChevronRight size={15} /></span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          ) : (
            <section className="section dashboard-section">
              <div className="crumb premium-crumb">
                <button onClick={() => setView("map")}><ArrowLeft size={15} /> Mapa de procesos</button>
                <ChevronRight size={14} />
                <span>{selProc?.name}</span>
              </div>
              <div className="process-hero">
                <div>
                  <div className="eyebrow">Proceso · {selProc?.sigla}</div>
                  <h2 className="h2">{selProc?.name}</h2>
                  <p className="lead">Documentación organizada por tipo documental, versión, vigencia y código interno.</p>
                </div>
                <div className="process-count"><FileStack size={18} /> {selProc ? countFor(selProc.id) : 0} documentos vigentes</div>
              </div>

              <div className="searchbar wide">
                <Search size={17} color="var(--clay)" />
                <input placeholder="Buscar en este proceso por nombre, código o tipo documental…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>

              {repoGroups.length ? repoGroups.map((g) => {
                const open = openFolders[g.type.id] !== false;
                return (
                  <div className="foldercard elevated" key={g.type.id}>
                    <div className="folderhead" onClick={() => setOpenFolders({ ...openFolders, [g.type.id]: !open })}>
                      <span className="ico">{open ? <FolderOpen size={20} /> : <Folder size={20} />}</span>
                      <h4>{g.type.name}</h4>
                      <span className="pill">{g.items.length}</span>
                      {open ? <ChevronDown size={18} color="var(--muted)" /> : <ChevronRight size={18} color="var(--muted)" />}
                    </div>
                    {open && g.items.map((d) => <DocumentRow key={d.id} d={d} setDetail={setDetail} />)}
                  </div>
                );
              }) : (
                <EmptyState title="Sin documentos para mostrar" text="No encontramos documentos en este proceso con el filtro actual." />
              )}
            </section>
          )}
        </div>
      </main>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{detail.name}</h3>
              <button className="iconbtn" onClick={() => setDetail(null)}><X size={17} /></button>
            </div>
            <div className="modal-body">
              <div className="doc-detail-hero">
                <FileText size={28} />
                <div>
                  <span className="code">{detail.code}</span>
                  <p>{procById(detail.processId)?.name}</p>
                </div>
              </div>
              <div className="detailrow"><span>Tipo</span><span>{typeById(detail.typeId)?.name}</span></div>
              <div className="detailrow"><span>Versión</span><span>V {detail.version}</span></div>
              <div className="detailrow"><span>Estado</span><span><span className={"badge " + STATES[detail.state].cls}>{STATES[detail.state].label}</span></span></div>
              <div className="detailrow"><span>Origen</span><span style={{ textTransform: "capitalize" }}>{detail.origin}</span></div>
              <div className="detailrow"><span>Visibilidad</span><span>{detail.isPublic ? "Público" : "Interno"}</span></div>
              {detail.due && <div className="detailrow"><span>Vence</span><span>{detail.due}</span></div>}
              {detail.hasFile ? (
                <a className="btn btn-primary" style={{ justifyContent: "center", textDecoration: "none" }} href={`/api/documents/${detail.id}/file`}>
                  <Download size={16} /> Descargar {detail.file}
                </a>
              ) : (
                <div className="note">Este documento aún no tiene archivo cargado.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <DocForm editing={editing} processes={processes} docTypes={docTypes} docs={docs} onClose={() => setEditing(null)} onSave={handleSave} />
      )}

      {profileOpen && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onUpdate={(updated) => setUser({ ...user, ...updated })} />
      )}
    </div>
  );
}

function HeroSearch({ user, stats, globalQuery, setGlobalQuery, quickProc, setQuickProc, quickType, setQuickType, processes, docTypes }) {
  return (
    <div className="hero-panel">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={14} /> Gestión documental inteligente</div>
        <h2>Hola, {user.full_name?.split(" ")[0]}. Encuentra cualquier documento en segundos.</h2>
        <p>Busca por palabra clave, código, nombre del proceso o tipo documental sin recorrer toda la ruta documental.</p>
      </div>
      <div className="hero-search-card">
        <div className="searchbar hero-search">
          <Search size={19} color="var(--clay)" />
          <input placeholder="Buscar por código, nombre, proceso o palabra clave…" value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)} autoComplete="off" />
        </div>
        <div className="quick-filters">
          <select className="sel" value={quickProc} onChange={(e) => setQuickProc(e.target.value)}>
            <option value="">Todos los procesos</option>
            {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="sel" value={quickType} onChange={(e) => setQuickType(e.target.value)}>
            <option value="">Todos los tipos documentales</option>
            {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="stats-grid">
        <Stat label="Documentos vigentes" value={stats.vigentes} />
        <Stat label="Procesos" value={stats.procesos} />
        <Stat label="Tipos documentales" value={stats.tipos} />
        <Stat label="Documentos internos" value={stats.internos} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function SearchResults({ results, procById, typeById, setDetail, clear }) {
  return (
    <div className="results-panel">
      <div className="section-title-row compact">
        <div>
          <div className="eyebrow"><SlidersHorizontal size={14} /> Resultados filtrados</div>
          <h2 className="h2">{results.length} documento{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}</h2>
        </div>
        <button className="btn btn-ghost" onClick={clear}>Limpiar búsqueda</button>
      </div>
      {results.length ? (
        <div className="doc-grid">
          {results.map((d) => (
            <button className="doc-card" key={d.id} onClick={() => setDetail(d)}>
              <div className="doc-icon"><FileText size={20} /></div>
              <span className="code">{d.code}</span>
              <h4>{d.name}</h4>
              <p>{procById(d.processId)?.name}</p>
              <div className="doc-card-foot">
                <span>{typeById(d.typeId)?.name}</span>
                <span className="view-link"><Eye size={14} /> Ver</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="No hubo coincidencias" text="Prueba con otra palabra clave, código o filtro de proceso." />
      )}
    </div>
  );
}

function DocumentRow({ d, setDetail }) {
  return (
    <div className="docrow premium-row" onClick={() => setDetail(d)}>
      <span className="fi"><FileText size={16} /></span>
      <span className="code">{d.code}</span>
      <span className="docname">{d.name}</span>
      <span className="ver">V {d.version}</span>
      <span className={"badge " + STATES[d.state].cls}>{STATES[d.state].label}</span>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Search size={22} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function AdminPanel({ docs, processes, docTypes, adminRows, tab, setTab, tabCount, fProc, setFProc, fType, setFType, aQuery, setAQuery, procById, typeById, setEditing, handleDelete }) {
  return (
    <section className="section dashboard-section">
      <div className="admin-hero">
        <div>
          <div className="eyebrow"><ShieldCheck size={14} /> Panel de administración</div>
          <h2 className="h2">Gestión de documentos</h2>
          <p className="lead">Crea, edita o elimina documentos. La consulta general sigue protegida para usuarios no administradores.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Nuevo documento</button>
      </div>

      <div className="admin-metrics">
        <Stat label="Total documentos" value={docs.length} />
        <Stat label="Procesos activos" value={processes.length} />
        <Stat label="Tipos documentales" value={docTypes.length} />
      </div>

      <div className="tabs admin-tabs">
        {Object.entries(STATES).map(([k, v]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{v.label} ({tabCount(k)})</button>
        ))}
      </div>

      <div className="toolbar admin-toolbar">
        <div className="searchbar" style={{ marginBottom: 0, maxWidth: 330 }}>
          <Search size={16} color="var(--muted)" />
          <input placeholder="Buscar nombre, código, proceso o tipo…" value={aQuery} onChange={(e) => setAQuery(e.target.value)} />
        </div>
        <select className="sel" value={fProc} onChange={(e) => setFProc(e.target.value)}>
          <option value="">Todos los procesos</option>
          {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="sel" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {adminRows.length ? (
        <table className="table admin-table">
          <thead>
            <tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Proceso</th><th>Versión</th><th>Visib.</th><th></th></tr>
          </thead>
          <tbody>
            {adminRows.map((d) => (
              <tr key={d.id}>
                <td><span className="code">{d.code}</span></td>
                <td>{d.name}</td>
                <td>{typeById(d.typeId)?.name}</td>
                <td style={{ color: "var(--soft)" }}>{procById(d.processId)?.name}</td>
                <td><span className="ver">V {d.version}</span></td>
                <td><span className="vis">{d.isPublic ? <><Globe size={13} /> Público</> : <><Lock size={13} /> Interno</>}</span></td>
                <td>
                  <div className="rowact">
                    <button className="iconbtn" title="Editar" onClick={() => setEditing(d)}><Pencil size={15} /></button>
                    <button className="iconbtn danger" title="Eliminar" onClick={() => handleDelete(d)}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={`No hay documentos en ${STATES[tab].label}`} text="Ajusta los filtros o crea un nuevo documento desde el panel." />
      )}
    </section>
  );
}

function AuthScreen({ onSuccess }) {
  const [tab, setTab] = useState("login");

  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="mark auth-mark">GI</div>
        <span className="eyebrow">Grupo Ingenio</span>
        <h1>Repositorio Documental</h1>
        <p>Controla, consulta y protege la documentación institucional desde una plataforma centralizada.</p>
        <div className="auth-bullets">
          <span><Search size={15} /> Búsqueda inteligente</span>
          <span><ShieldCheck size={15} /> Acceso por roles</span>
          <span><FileStack size={15} /> Gestión documental</span>
        </div>
      </div>
      <div className="auth-card">
        <div className="tabs auth-tabs">
          <button className={tab === "login" ? "on" : ""} onClick={() => setTab("login")}>Iniciar sesión</button>
          <button className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}>Registrarse</button>
        </div>
        {tab === "login" ? <LoginForm onSuccess={onSuccess} /> : <RegisterForm onSuccess={() => setTab("login")} />}
      </div>
    </div>
  );
}

function LoginForm({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !password || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (r.ok) onSuccess();
    else setErr("Correo o contraseña incorrectos.");
  }

  return (
    <div className="form-stack">
      <div className="field">
        <label>Correo electrónico</label>
        <input type="email" value={email} autoFocus autoComplete="email" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      <div className="field">
        <label>Contraseña</label>
        <input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn btn-primary" disabled={!email || !password || busy} onClick={submit} style={{ justifyContent: "center" }}>
        <Lock size={15} /> {busy ? "Entrando…" : "Iniciar sesión"}
      </button>
    </div>
  );
}

function RegisterForm({ onSuccess }) {
  const [form, setForm] = useState({ full_name: "", cedula: "", email: "", password: "", cargo: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.full_name || !form.cedula || !form.email || !form.password || !form.cargo || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (r.ok) { setOk(true); setTimeout(onSuccess, 1800); }
    else { const d = await r.json(); setErr(d.error || "Error al registrar"); }
  }

  if (ok) return <div className="success-card">¡Cuenta creada! Redirigiendo al inicio de sesión…</div>;
  const canSubmit = form.full_name && form.cedula && form.email && form.password && form.cargo && !busy;

  return (
    <div className="form-stack">
      <div className="field"><label>Nombre completo</label><input type="text" value={form.full_name} autoFocus autoComplete="name" onChange={(e) => set("full_name", e.target.value)} /></div>
      <div className="row2">
        <div className="field"><label>Cédula</label><input type="text" value={form.cedula} onChange={(e) => set("cedula", e.target.value)} /></div>
        <div className="field"><label>Cargo</label><input type="text" value={form.cargo} onChange={(e) => set("cargo", e.target.value)} /></div>
      </div>
      <div className="field"><label>Correo electrónico</label><input type="email" value={form.email} autoComplete="email" onChange={(e) => set("email", e.target.value)} /></div>
      <div className="field"><label>Contraseña</label><input type="password" value={form.password} autoComplete="new-password" onChange={(e) => set("password", e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
      {err && <div className="err">{err}</div>}
      <button className="btn btn-primary" disabled={!canSubmit} onClick={submit} style={{ justifyContent: "center" }}>{busy ? "Registrando…" : "Crear cuenta"}</button>
    </div>
  );
}

function ProfileModal({ user, onClose, onUpdate }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [cargo, setCargo] = useState(user.cargo || "");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true); setErr("");
    const body = { full_name: fullName, cargo };
    if (newPw) { body.currentPassword = curPw; body.newPassword = newPw; }
    const r = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { onUpdate({ full_name: fullName, cargo }); onClose(); }
    else { const d = await r.json(); setErr(d.error || "Error al guardar"); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Mi perfil</h3><button className="iconbtn" onClick={onClose}><X size={17} /></button></div>
        <div className="modal-body">
          <div className="field"><label>Nombre completo</label><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="field"><label>Cargo</label><input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} /></div>
          <div className="field"><label>Correo</label><input type="text" value={user.email} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} /></div>
          <div style={{ height: 1, background: "var(--line)" }} />
          <div className="mini-label">Cambiar contraseña (opcional)</div>
          <div className="field"><label>Contraseña actual</label><input type="password" value={curPw} autoComplete="current-password" onChange={(e) => setCurPw(e.target.value)} /></div>
          <div className="field"><label>Nueva contraseña</label><input type="password" value={newPw} autoComplete="new-password" onChange={(e) => setNewPw(e.target.value)} /></div>
          {err && <div className="err">{err}</div>}
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving || !fullName} onClick={submit}><Check size={16} /> {saving ? "Guardando…" : "Guardar"}</button></div>
      </div>
    </div>
  );
}

function DocForm({ editing, processes, docTypes, docs, onClose, onSave }) {
  const isNew = editing === "new";
  const [form, setForm] = useState(isNew ? { name: "", typeId: docTypes[0]?.id, processId: processes[0]?.id, state: "no_publicado", origin: "interno", isPublic: false, due: "" } : { ...editing });
  const [fileObj, setFileObj] = useState(null);
  const [newVersion, setNewVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const proc = processes.find((p) => p.id === Number(form.processId));
  const type = docTypes.find((t) => t.id === Number(form.typeId));
  let consec;
  if (isNew) {
    consec = docs.filter((d) => d.processId === Number(form.processId) && d.typeId === Number(form.typeId)).reduce((m, d) => Math.max(m, d.consecutive), 0) + 1;
  } else consec = editing.consecutive;
  const previewCode = isNew ? `GI-${proc?.sigla}-${type?.sigla}-${String(consec).padStart(2, "0")}` : editing.code;

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    await onSave({ ...form, fileObj, newVersion });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{isNew ? "Nuevo documento" : "Editar documento"}</h3><button className="iconbtn" onClick={onClose}><X size={17} /></button></div>
        <div className="modal-body">
          <div className="field"><label>Nombre del documento</label><input type="text" value={form.name} placeholder="Ej. Control de documentos y registros" onChange={(e) => set("name", e.target.value)} /></div>
          <div className="row2">
            <div className="field"><label>Proceso</label><select value={form.processId} onChange={(e) => set("processId", e.target.value)} disabled={!isNew}>{processes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className="field"><label>Tipo de documento</label><select value={form.typeId} onChange={(e) => set("typeId", e.target.value)} disabled={!isNew}>{docTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          </div>
          <div className="field"><label>Código {isNew ? "(automático)" : ""}</label><div className="codepreview">{previewCode}</div></div>
          <div className="row2">
            <div className="field"><label>Estado</label><select value={form.state} onChange={(e) => set("state", e.target.value)}>{Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div className="field"><label>Origen</label><select value={form.origin} onChange={(e) => set("origin", e.target.value)}><option value="interno">Interno</option><option value="externo">Externo</option></select></div>
          </div>
          <div className="row2">
            <div className="field"><label>Archivo (PDF / Word){!isNew && " — opcional"}</label><input type="file" onChange={(e) => setFileObj(e.target.files?.[0] || null)} /></div>
            <div className="field"><label>Fecha de vencimiento</label><input type="date" value={form.due || ""} onChange={(e) => set("due", e.target.value)} /></div>
          </div>
          <div className="toggle" onClick={() => set("isPublic", !form.isPublic)}><div className={"tg" + (form.isPublic ? " on" : "")} />{form.isPublic ? "Visible al público" : "Solo interno"}</div>
          {!isNew && <div className="toggle" onClick={() => setNewVersion(!newVersion)}><div className={"tg" + (newVersion ? " on" : "")} />Subir como nueva versión (V {editing.version} → V {(parseFloat(editing.version) + 1).toFixed(1)})</div>}
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!form.name.trim() || saving} onClick={submit}><Check size={16} /> {saving ? "Guardando…" : isNew ? "Crear documento" : "Guardar cambios"}</button></div>
      </div>
    </div>
  );
}
