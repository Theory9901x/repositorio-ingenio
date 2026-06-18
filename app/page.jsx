"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText, Folder, FolderOpen, ChevronRight, ChevronDown, Search, Plus,
  Pencil, Trash2, X, ArrowLeft, Download, Lock, Globe, Settings, Check,
  FileStack, History, LogOut, User,
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

export default function Page() {
  /* ── auth ── */
  const [authLoaded, setAuthLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  /* ── app data ── */
  const [loading, setLoading] = useState(false);
  const [processes, setProcesses] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);

  const [view, setView] = useState("map");
  const [selProc, setSelProc] = useState(null);
  const [query, setQuery] = useState("");
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
  const goProcess = (p) => { setSelProc(p); setView("repo"); setQuery(""); };

  const repoGroups = useMemo(() => {
    if (!selProc) return [];
    const list = docs
      .filter((d) => d.processId === selProc.id && d.state !== "anulado")
      .filter((d) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q);
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
        return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q);
      });
  }, [docs, tab, fProc, fType, aQuery]);

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

  /* ── renders ── */
  if (!authLoaded) return <div className="loading">Cargando…</div>;
  if (!user) return <AuthScreen onSuccess={handleLoginSuccess} />;
  if (loading) return <div className="loading">Cargando repositorio…</div>;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="mark">GI</div>
          <div>
            <h1>Grupo Ingenio</h1>
            <p>Repositorio Documental</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="modeswitch">
            <button className={!showAdmin ? "on" : ""} onClick={() => setShowAdmin(false)}>
              <Globe size={14} /> Consulta
            </button>
            {isAdmin && (
              <button className={showAdmin ? "on" : ""} onClick={() => setShowAdmin(true)}>
                <Settings size={14} /> Administración
              </button>
            )}
          </div>
          <div className="modeswitch">
            <button onClick={() => setProfileOpen(true)} title="Mi perfil" style={{ gap: 6 }}>
              <User size={14} />
              <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name.split(" ")[0]}
              </span>
            </button>
            <button onClick={logout} title="Cerrar sesión"><LogOut size={14} /></button>
          </div>
        </div>
      </div>

      <div className="wrap">
        {showAdmin && isAdmin ? (
          <div className="section">
            <div className="eyebrow">Panel de administración</div>
            <h2 className="h2">Gestión de documentos</h2>
            <p className="lead">Crea, edita o elimina documentos de cualquier tipo. El código se genera solo según la nomenclatura.</p>

            <div style={{ height: 26 }} />
            <div className="tabs" style={{ marginBottom: 16, width: "fit-content" }}>
              {Object.entries(STATES).map(([k, v]) => (
                <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {v.label} ({tabCount(k)})
                </button>
              ))}
            </div>

            <div className="toolbar">
              <div className="searchbar" style={{ marginBottom: 0, maxWidth: 280 }}>
                <Search size={16} color="var(--muted)" />
                <input placeholder="Buscar nombre o código…" value={aQuery} onChange={(e) => setAQuery(e.target.value)} />
              </div>
              <select className="sel" value={fProc} onChange={(e) => setFProc(e.target.value)}>
                <option value="">Todos los procesos</option>
                {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="sel" value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">Todos los tipos</option>
                {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="grow" />
              <button className="btn btn-primary" onClick={() => setEditing("new")}>
                <Plus size={16} /> Nuevo documento
              </button>
            </div>

            {adminRows.length ? (
              <table className="table">
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
              <div className="empty">No hay documentos en "{STATES[tab].label}" con esos filtros.</div>
            )}
          </div>
        ) : view === "map" ? (
          <div className="section">
            <div className="eyebrow">Sistema Integrado de Gestión</div>
            <h2 className="h2">Mapa de procesos</h2>
            <p className="lead">Selecciona un proceso para abrir su repositorio documental: manuales, procedimientos, formatos, instructivos y demás.</p>

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
                  <div className="grid">
                    {list.map((p) => (
                      <button className="pcard" key={p.id} onClick={() => goProcess(p)}>
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
          </div>
        ) : (
          <div className="section">
            <div className="crumb">
              <button onClick={() => setView("map")}><ArrowLeft size={15} /> Mapa de procesos</button>
              <ChevronRight size={14} />
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>{selProc.name}</span>
            </div>
            <div className="eyebrow">Proceso · {selProc.sigla}</div>
            <h2 className="h2">{selProc.name}</h2>
            <p className="lead">Documentación del proceso, organizada por tipo de documento.</p>

            <div style={{ height: 22 }} />
            <div className="searchbar">
              <Search size={16} color="var(--muted)" />
              <input placeholder="Buscar en este proceso…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>

            {repoGroups.length ? repoGroups.map((g) => {
              const open = openFolders[g.type.id] !== false;
              return (
                <div className="foldercard" key={g.type.id}>
                  <div className="folderhead" onClick={() => setOpenFolders({ ...openFolders, [g.type.id]: !open })}>
                    <span className="ico">{open ? <FolderOpen size={19} /> : <Folder size={19} />}</span>
                    <h4>{g.type.name}</h4>
                    <span className="pill">{g.items.length}</span>
                    {open ? <ChevronDown size={18} color="var(--muted)" /> : <ChevronRight size={18} color="var(--muted)" />}
                  </div>
                  {open && g.items.map((d) => (
                    <div className="docrow" key={d.id} onClick={() => setDetail(d)}>
                      <span className="fi"><FileText size={16} /></span>
                      <span className="code">{d.code}</span>
                      <span className="docname">{d.name}</span>
                      <span className="ver">V {d.version}</span>
                      <span className={"badge " + STATES[d.state].cls}>{STATES[d.state].label}</span>
                    </div>
                  ))}
                </div>
              );
            }) : (
              <div className="empty">Sin documentos para mostrar.</div>
            )}
          </div>
        )}
      </div>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{detail.name}</h3>
              <button className="iconbtn" onClick={() => setDetail(null)}><X size={17} /></button>
            </div>
            <div className="modal-body">
              <div className="detailrow"><span>Código</span><span className="code">{detail.code}</span></div>
              <div className="detailrow"><span>Tipo</span><span>{typeById(detail.typeId)?.name}</span></div>
              <div className="detailrow"><span>Proceso</span><span>{procById(detail.processId)?.name}</span></div>
              <div className="detailrow"><span>Versión</span><span>V {detail.version}</span></div>
              <div className="detailrow"><span>Estado</span><span><span className={"badge " + STATES[detail.state].cls}>{STATES[detail.state].label}</span></span></div>
              <div className="detailrow"><span>Origen</span><span style={{ textTransform: "capitalize" }}>{detail.origin}</span></div>
              <div className="detailrow"><span>Visibilidad</span><span>{detail.isPublic ? "Público" : "Interno"}</span></div>
              {detail.due && <div className="detailrow"><span>Vence</span><span>{detail.due}</span></div>}
              {detail.hasFile ? (
                <a className="btn btn-primary" style={{ justifyContent: "center", textDecoration: "none" }}
                  href={`/api/documents/${detail.id}/file`}>
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
        <DocForm
          editing={editing}
          processes={processes}
          docTypes={docTypes}
          docs={docs}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {profileOpen && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onUpdate={(updated) => setUser({ ...user, ...updated })}
        />
      )}
    </>
  );
}

/* ──────────────────────────────────────────────
   Pantalla de autenticación (login + registro)
────────────────────────────────────────────── */
function AuthScreen({ onSuccess }) {
  const [tab, setTab] = useState("login");

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "22px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, background: "var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--paper)", fontFamily: "'Bricolage Grotesque'",
            fontWeight: 800, fontSize: 20, margin: "0 auto 14px",
          }}>GI</div>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque'", fontWeight: 800,
            fontSize: 26, letterSpacing: "-.02em", margin: "0 0 5px",
          }}>Grupo Ingenio</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0, textTransform: "uppercase", letterSpacing: ".04em" }}>
            Repositorio Documental
          </p>
        </div>

        <div style={{
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: 18, overflow: "hidden",
          boxShadow: "0 20px 50px -20px rgba(27,26,23,.35)",
        }}>
          <div className="tabs" style={{ margin: "16px 20px 0" }}>
            <button className={tab === "login" ? "on" : ""} onClick={() => setTab("login")} style={{ flex: 1 }}>
              Iniciar sesión
            </button>
            <button className={tab === "register" ? "on" : ""} onClick={() => setTab("register")} style={{ flex: 1 }}>
              Registrarse
            </button>
          </div>
          <div style={{ padding: "20px 22px 24px" }}>
            {tab === "login"
              ? <LoginForm onSuccess={onSuccess} />
              : <RegisterForm onSuccess={() => setTab("login")} />
            }
          </div>
        </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label>Correo electrónico</label>
        <input type="email" value={email} autoFocus autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      <div className="field">
        <label>Contraseña</label>
        <input type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn btn-primary" disabled={!email || !password || busy}
        onClick={submit} style={{ justifyContent: "center" }}>
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

  if (ok) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0", color: "var(--green)", fontWeight: 600 }}>
        ¡Cuenta creada! Redirigiendo al inicio de sesión…
      </div>
    );
  }

  const canSubmit = form.full_name && form.cedula && form.email && form.password && form.cargo && !busy;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label>Nombre completo</label>
        <input type="text" value={form.full_name} autoFocus autoComplete="name"
          onChange={(e) => set("full_name", e.target.value)} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Cédula</label>
          <input type="text" value={form.cedula} onChange={(e) => set("cedula", e.target.value)} />
        </div>
        <div className="field">
          <label>Cargo</label>
          <input type="text" value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Correo electrónico</label>
        <input type="email" value={form.email} autoComplete="email"
          onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="field">
        <label>Contraseña</label>
        <input type="password" value={form.password} autoComplete="new-password"
          onChange={(e) => set("password", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn btn-primary" disabled={!canSubmit}
        onClick={submit} style={{ justifyContent: "center" }}>
        {busy ? "Registrando…" : "Crear cuenta"}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Modal de perfil
────────────────────────────────────────────── */
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
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) { onUpdate({ full_name: fullName, cargo }); onClose(); }
    else { const d = await r.json(); setErr(d.error || "Error al guardar"); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Mi perfil</h3>
          <button className="iconbtn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nombre completo</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label>Cargo</label>
            <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <div className="field">
            <label>Correo</label>
            <input type="text" value={user.email} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
          </div>
          <div style={{ height: 1, background: "var(--line)" }} />
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Cambiar contraseña (opcional)
          </div>
          <div className="field">
            <label>Contraseña actual</label>
            <input type="password" value={curPw} autoComplete="current-password"
              onChange={(e) => setCurPw(e.target.value)} />
          </div>
          <div className="field">
            <label>Nueva contraseña</label>
            <input type="password" value={newPw} autoComplete="new-password"
              onChange={(e) => setNewPw(e.target.value)} />
          </div>
          {err && <div className="err">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !fullName} onClick={submit}>
            <Check size={16} /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Formulario crear / editar documento
────────────────────────────────────────────── */
function DocForm({ editing, processes, docTypes, docs, onClose, onSave }) {
  const isNew = editing === "new";
  const [form, setForm] = useState(
    isNew
      ? { name: "", typeId: docTypes[0]?.id, processId: processes[0]?.id, state: "no_publicado", origin: "interno", isPublic: false, due: "" }
      : { ...editing }
  );
  const [fileObj, setFileObj] = useState(null);
  const [newVersion, setNewVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const proc = processes.find((p) => p.id === Number(form.processId));
  const type = docTypes.find((t) => t.id === Number(form.typeId));
  let consec;
  if (isNew) {
    consec = docs.filter((d) => d.processId === Number(form.processId) && d.typeId === Number(form.typeId))
      .reduce((m, d) => Math.max(m, d.consecutive), 0) + 1;
  } else consec = editing.consecutive;
  const previewCode = isNew
    ? `GI-${proc?.sigla}-${type?.sigla}-${String(consec).padStart(2, "0")}`
    : editing.code;

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    await onSave({ ...form, fileObj, newVersion });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isNew ? "Nuevo documento" : "Editar documento"}</h3>
          <button className="iconbtn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nombre del documento</label>
            <input type="text" value={form.name} placeholder="Ej. Control de documentos y registros"
              onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="row2">
            <div className="field">
              <label>Proceso</label>
              <select value={form.processId} onChange={(e) => set("processId", e.target.value)} disabled={!isNew}>
                {processes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo de documento</label>
              <select value={form.typeId} onChange={(e) => set("typeId", e.target.value)} disabled={!isNew}>
                {docTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Código {isNew ? "(automático)" : ""}</label>
            <div className="codepreview">{previewCode}</div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Estado</label>
              <select value={form.state} onChange={(e) => set("state", e.target.value)}>
                {Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Origen</label>
              <select value={form.origin} onChange={(e) => set("origin", e.target.value)}>
                <option value="interno">Interno</option>
                <option value="externo">Externo</option>
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Archivo (PDF / Word){!isNew && " — opcional"}</label>
              <input type="file" onChange={(e) => setFileObj(e.target.files?.[0] || null)} />
            </div>
            <div className="field">
              <label>Fecha de vencimiento</label>
              <input type="date" value={form.due || ""} onChange={(e) => set("due", e.target.value)} />
            </div>
          </div>
          <div className="toggle" onClick={() => set("isPublic", !form.isPublic)}>
            <div className={"tg" + (form.isPublic ? " on" : "")} />
            {form.isPublic ? "Visible al público" : "Solo interno"}
          </div>
          {!isNew && (
            <div className="toggle" onClick={() => setNewVersion(!newVersion)}>
              <div className={"tg" + (newVersion ? " on" : "")} />
              Subir como nueva versión (V {editing.version} → V {(parseFloat(editing.version) + 1).toFixed(1)})
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!form.name.trim() || saving} onClick={submit}>
            <Check size={16} /> {saving ? "Guardando…" : isNew ? "Crear documento" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
