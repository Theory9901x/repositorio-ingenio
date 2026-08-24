"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, Briefcase, Building2, CalendarClock, CalendarDays, CalendarRange, Menu, ChevronRight, ClipboardList,
  FileText, FolderOpen, Home, Inbox, Layers, Plus, Search, Settings, ShieldCheck,
  Trash2, Users,
} from "lucide-react";
import { api, enviarJson } from "./api";
import { enCache, invalidar, pedir, precargar } from "./cache";
import { BotonExportar, Cargando, Confirmar, Drawer, Estado, Toast, Vacio, Visor, fmtFecha, iniciales } from "./ui";
import TabResumen from "./TabResumen";
import TabDocumentos from "./TabDocumentos";
import TabActividades from "./TabActividades";
import TabEvidencias from "./TabEvidencias";
import TabContratistas from "./TabContratistas";
import TabMesas from "./TabMesas";
import TabReuniones from "./TabReuniones";
import TabSolicitudes from "./TabSolicitudes";
import TabHistorial from "./TabHistorial";

const TABS = [
  { id: "resumen", label: "Resumen", icon: Layers },
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "evidencias", label: "Evidencias", icon: ShieldCheck },
  { id: "actividades", label: "Actividades", icon: ClipboardList },
  { id: "contratistas", label: "Contratistas", icon: Users, ocultarTrabajador: true },
  { id: "reuniones", label: "Reuniones", icon: CalendarDays },
  { id: "mesas", label: "Mesas de trabajo", icon: CalendarRange },
  { id: "solicitudes", label: "Solicitudes", icon: Inbox },
  { id: "historial", label: "Historial", icon: CalendarClock },
];

const ETIQUETA_ROL = { ADMIN: "Administrador", SUPERVISOR: "Supervisor", TRABAJADOR: "Contratista" };

export default function GestionContractual({ ruta: rutaInicial = [] }) {
  // La navegación interna se resuelve en cliente: cambiar de pestaña o de
  // contrato no debe provocar una recarga de la página. La URL se mantiene
  // sincronizada con history para que siga siendo compartible y el botón
  // «atrás» del navegador funcione.
  const router = useRouter();
  const [ruta, setRuta] = useState(() => rutaInicial.map(String));
  const [ctx, setCtx] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [visor, setVisor] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false); // cajón lateral en móvil

  // Estado del contrato abierto
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Formularios de nivel 1
  const [drawerEmpresa, setDrawerEmpresa] = useState(null);
  const [drawerContrato, setDrawerContrato] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [directorio, setDirectorio] = useState([]);

  // La URL es la fuente de verdad de la navegación.
  const [nivel, param1, tab = "resumen", param2, param3, param4] = ruta;
  const empresaId = nivel === "empresa" ? Number(param1) : null;
  const contratoId = nivel === "contrato" ? Number(param1) : null;

  const avisar = useCallback((msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), tipo === "error" ? 5000 : 2800);
  }, []);

  const navegar = useCallback((partes, reemplazar = false) => {
    const limpias = partes.filter((p) => p !== null && p !== undefined && p !== "").map(String);
    const url = "/gestion-contractual" + (limpias.length ? "/" + limpias.join("/") : "");
    if (typeof window !== "undefined" && window.location.pathname !== url) {
      window.history[reemplazar ? "replaceState" : "pushState"]({}, "", url);
    }
    setRuta(limpias);
    setMenuAbierto(false);
  }, []);
  const ir = useCallback((...partes) => navegar(partes), [navegar]);

  // El botón «atrás» del navegador vuelve al nivel anterior sin recargar.
  useEffect(() => {
    const alVolver = () => {
      const partes = window.location.pathname.replace(/^\/gestion-contractual\/?/, "").split("/").filter(Boolean);
      setRuta(partes.map(decodeURIComponent));
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  const cargarContexto = useCallback(async (refrescar = false) => {
    // Si el módulo ya se visitó en esta sesión, se pinta al instante desde la
    // caché y se revalida en segundo plano: la entrada no espera a la red.
    const url = "/api/gc/context";
    const guardado = enCache(url);
    if (guardado) { setCtx(guardado); setError(null); setCargando(false); }
    try {
      const datos = await pedir(url, { refrescar: refrescar || !!guardado });
      setCtx(datos);
      setError(null);
    } catch (e) {
      if (!guardado) setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarContexto(); }, [cargarContexto]);

  // Carga la cabecera contextual cuando cambia el contrato abierto.
  // Si ya se visitó, se pinta al instante desde la caché y se revalida detrás.
  useEffect(() => {
    if (!contratoId) { setDetalle(null); return; }
    let vigente = true;
    const url = `/api/gc/contracts/${contratoId}`;
    const guardado = enCache(url);
    if (guardado) { setDetalle(guardado); setError(null); }
    setCargandoDetalle(!guardado);
    pedir(url, { refrescar: !!guardado })
      .then((d) => { if (vigente) { setDetalle(d); setError(null); } })
      .catch((e) => { if (vigente && !guardado) { setDetalle(null); setError(e.message); } })
      .finally(() => { if (vigente) setCargandoDetalle(false); });
    return () => { vigente = false; };
  }, [contratoId]);

  // Con el contrato abierto se adelantan los datos del resto de pestañas en
  // segundo plano: al pulsarlas ya están en caché y se pintan sin esperar.
  useEffect(() => {
    if (!contratoId) return;
    const hoy = new Date();
    const base = `/api/gc/contracts/${contratoId}`;
    const tardar = setTimeout(() => {
      for (const ruta of [
        "/documents", "/folders", "/participants", "/requests", "/history", "/meetings", "/meetings?tipo=mesa",
        "/evidences?todo=1",
        `/activities?todo=1&year=${hoy.getFullYear()}&month=${hoy.getMonth() + 1}`,
      ]) precargar(base + ruta);
    }, 250); // se deja pasar el primer render para no competir con él
    return () => clearTimeout(tardar);
  }, [contratoId]);

  const puede = useCallback((permiso) => !!detalle?.permisos?.includes(permiso), [detalle]);
  const esAdmin = ctx?.me?.isAdmin;

  async function cargarDirectorio() {
    try {
      setDirectorio(await api(`/api/gc/users${contratoId ? `?contractId=${contratoId}` : ""}`));
    } catch { setDirectorio([]); }
  }

  /* ---------- Acciones de nivel 1 ---------- */
  async function guardarEmpresa(datos) {
    setGuardando(true);
    try {
      if (datos.id) await enviarJson(`/api/gc/companies/${datos.id}`, "PUT", datos);
      else await enviarJson("/api/gc/companies", "POST", datos);
      invalidar("/api/gc/");
      avisar(datos.id ? "Empresa actualizada" : "Empresa creada");
      setDrawerEmpresa(null);
      await cargarContexto();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function guardarContrato(datos) {
    setGuardando(true);
    try {
      if (datos.id) await enviarJson(`/api/gc/contracts/${datos.id}`, "PUT", datos);
      else {
        const r = await enviarJson("/api/gc/contracts", "POST", datos);
        setDrawerContrato(null);
        await cargarContexto();
        invalidar("/api/gc/");
        avisar("Contrato creado");
        ir("contrato", r.id, "resumen");
        return;
      }
      invalidar("/api/gc/");
      avisar("Contrato actualizado");
      setDrawerContrato(null);
      await cargarContexto();
      if (contratoId) setDetalle(await api(`/api/gc/contracts/${contratoId}`));
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function eliminarContrato(id, titulo) {
    try {
      await api(`/api/gc/contracts/${id}`, { method: "DELETE" });
      invalidar("/api/gc/");
      avisar(`Contrato «${titulo}» eliminado`);
      setConfirmar(null);
      await cargarContexto();
      ir();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  /* ---------- Render ---------- */
  if (cargando) return <div className="gc-loading"><span className="gc-spin" /> Cargando gestión contractual…</div>;
  if (!ctx) {
    return (
      <div className="gc-loading" style={{ flexDirection: "column", gap: 16 }}>
        <span>{error || "Debes iniciar sesión."}</span>
        <a className="gc-btn primary" href="/">Volver al repositorio</a>
      </div>
    );
  }

  const rolActual = detalle?.rol || ctx.rolGlobal;
  const contrato = detalle?.contrato;
  const empresa = empresaId ? ctx.empresas.find((e) => e.id === empresaId) : null;
  const contratosEmpresa = empresaId ? ctx.contratos.filter((c) => c.company_id === empresaId) : [];

  const filtrar = (lista, campos) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((x) => campos.some((c) => String(x[c] || "").toLowerCase().includes(q)));
  };

  const tabsVisibles = TABS.filter((t) => !(t.ocultarTrabajador && rolActual === "TRABAJADOR"));

  return (
    <div className="gc">
      {/* ============ Sidebar global ============ */}
      {menuAbierto && <div className="movil-tapa" onClick={() => setMenuAbierto(false)} />}
      <aside className={`gc-side${menuAbierto ? " abierto" : ""}`}>
        <div className="gc-brand">
          <span className="gc-brand-mark"><img src="/branding/logo-grupo-ingenio.png" alt="Grupo Ingenio" /></span>
          <div>
            <h1>Grupo Ingenio</h1>
            <p>Gestión documental</p>
          </div>
        </div>
        <nav className="gc-nav">
          <span className="gc-nav-label">Gestión contractual</span>
          <button className={!nivel ? "on" : ""} onClick={() => ir()}>
            <Home size={17} /> {rolActual === "TRABAJADOR" ? "Mis contratos" : "Inicio del módulo"}
          </button>
          {rolActual !== "TRABAJADOR" && (
            <button className={nivel === "empresa" ? "on" : ""} onClick={() => ir()}>
              <Building2 size={17} /> Empresas
              {ctx.empresas.length > 0 && <span className="badge" style={{ background: "rgba(74,103,255,.12)", color: "var(--gc-blue)" }}>{ctx.empresas.length}</span>}
            </button>
          )}
          <button className={nivel === "contrato" ? "on" : ""} onClick={() => contratoId ? null : ir()}>
            <Briefcase size={17} /> Contratos
            <span className="badge" style={{ background: "rgba(74,103,255,.12)", color: "var(--gc-blue)" }}>{ctx.contratos.length}</span>
          </button>
          <span className="gc-nav-label">Plataforma</span>
          <button onClick={() => (location.href = "/workspace")}><FolderOpen size={17} /> Mi espacio / Plan</button>
          <button onClick={() => router.push("/")}><ArrowLeft size={17} /> Volver al repositorio</button>
        </nav>
        <div className="gc-side-user">
          <span className="gc-avatar">{iniciales(ctx.me.full_name)}</span>
          <div>
            <strong>{ctx.me.full_name}</strong>
            <span>{ctx.me.cargo || ETIQUETA_ROL[ctx.rolGlobal]}</span>
          </div>
        </div>
      </aside>

      {/* ============ Contenido ============ */}
      <div className="gc-main">
        <header className="gc-top">
          <button className="movil-menu" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"><Menu size={19} /></button>
          <nav className="gc-crumb">
            <button onClick={() => ir()}><Home size={13} /> Gestión contractual</button>
            {empresa && (<><span className="sep"><ChevronRight size={12} /></span><span className="here">{empresa.name}</span></>)}
            {contrato && (
              <>
                <span className="sep"><ChevronRight size={12} /></span>
                {contrato.company_id
                  ? <button onClick={() => ir("empresa", contrato.company_id)}>{contrato.company_name || contrato.entity_name}</button>
                  : <span className="here">{contrato.entity_name || "Sin empresa"}</span>}
                <span className="sep"><ChevronRight size={12} /></span>
                <button onClick={() => ir("contrato", contrato.id, "resumen")}>{contrato.code || contrato.title}</button>
                <span className="sep"><ChevronRight size={12} /></span>
                <span className="here">{TABS.find((t) => t.id === tab)?.label || "Resumen"}</span>
              </>
            )}
          </nav>
          {!contratoId && (
            <div className="gc-search">
              <Search size={15} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empresa o contrato…" />
            </div>
          )}
          <span className="gc-rolechip"><ShieldCheck size={13} /> {ETIQUETA_ROL[rolActual]}</span>
          <button className="gc-topbtn" title="Notificaciones" onClick={() => (location.href = "/")}><Bell size={17} /></button>
        </header>

        <main className="gc-body">
          {error && !contratoId && (
            <div className="gc-card" style={{ borderColor: "rgba(226,68,95,.3)", color: "var(--gc-danger)", fontWeight: 700, fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* ===== Nivel 1: entrada al módulo ===== */}
          {!nivel && (
            <>
              <div className="gc-head">
                <div>
                  <h2>{rolActual === "TRABAJADOR" ? "Mis contratos" : "Gestión contractual"}</h2>
                  <p>{rolActual === "TRABAJADOR"
                    ? "Tus obligaciones contractuales y lo que debes entregar."
                    : "Selecciona una empresa o un contrato para trabajar en él."}</p>
                </div>
                {esAdmin && (
                  <div className="gc-actions">
                    <button className="gc-btn ghost" onClick={() => setDrawerEmpresa({})}><Building2 size={15} /> Nueva empresa</button>
                    <button className="gc-btn primary" onClick={() => { cargarDirectorio(); setDrawerContrato({}); }}><Plus size={15} /> Nuevo contrato</button>
                  </div>
                )}
              </div>

              <section className="gc-kpis">
                {ctx.kpis.map((k, i) => (
                  <article className="gc-kpi" key={k.id} style={{ "--acc": ["#4a67ff", "#7b5cfa", "#e0930c", "#1fc4dc", "#e2445f"][i % 5] }}>
                    <strong>{k.valor}</strong>
                    <span>{k.label}</span>
                  </article>
                ))}
              </section>

              {rolActual !== "TRABAJADOR" && (
                <section className="gc-card">
                  <header className="gc-card-title">
                    <h3>Empresas en seguimiento</h3>
                    <span style={{ fontSize: 11.5, color: "var(--gc-muted)", fontWeight: 700 }}>{ctx.empresas.length} empresa(s)</span>
                  </header>
                  {ctx.empresas.length ? (
                    <div className="gc-grid c3">
                      {filtrar(ctx.empresas, ["name", "nit"]).map((e) => (
                        <button className="gc-item" key={e.id} onClick={() => ir("empresa", e.id)}>
                          <span className="ico">{iniciales(e.name)}</span>
                          <span className="txt">
                            <b>{e.name}</b>
                            <small>{e.contratos} contrato(s) · {e.nit || e.entity_type || "Sin NIT"}</small>
                          </span>
                          <ChevronRight size={15} style={{ color: "var(--gc-muted)" }} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Vacio icono={Building2} titulo="Todavía no hay empresas registradas"
                      texto="Registra la primera empresa para agrupar sus contratos."
                      accion={esAdmin && <button className="gc-btn primary" onClick={() => setDrawerEmpresa({})}><Plus size={15} /> Nueva empresa</button>} />
                  )}
                </section>
              )}

              <section className="gc-card">
                <header className="gc-card-title">
                  <h3>{rolActual === "TRABAJADOR" ? "Contratos donde participo" : "Contratos"}</h3>
                </header>
                {ctx.contratos.length ? (
                  <div className="gc-grid c2">
                    {filtrar(ctx.contratos, ["title", "code", "company_name", "entity_name"]).map((c) => (
                      <button className="gc-item" key={c.id} onMouseEnter={() => precargar(`/api/gc/contracts/${c.id}`)} onClick={() => ir("contrato", c.id, "resumen")}>
                        <span className="ico"><Briefcase size={17} /></span>
                        <span className="txt">
                          <b>{c.title}</b>
                          <small>{c.code ? `${c.code} · ` : ""}{c.company_name || c.entity_name || "Sin empresa"}</small>
                          <small style={{ marginTop: 5, display: "flex", gap: 8, alignItems: "center" }}>
                            <Estado valor={c.status} />
                            {c.dias_para_vencer !== null && c.dias_para_vencer >= 0 && c.dias_para_vencer <= 30 && (
                              <span className="gc-badge warn">Vence en {c.dias_para_vencer} d</span>
                            )}
                            {Number(c.por_revisar) > 0 && rolActual !== "TRABAJADOR" && (
                              <span className="gc-badge info">{c.por_revisar} por revisar</span>
                            )}
                          </small>
                        </span>
                        <ChevronRight size={15} style={{ color: "var(--gc-muted)" }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Vacio icono={Briefcase} titulo="No hay contratos todavía"
                    texto={esAdmin ? "Crea el primer contrato y asígnale su empresa y participantes." : "Cuando te asocien a un contrato, aparecerá aquí."}
                    accion={esAdmin && <button className="gc-btn primary" onClick={() => { cargarDirectorio(); setDrawerContrato({}); }}><Plus size={15} /> Nuevo contrato</button>} />
                )}
              </section>
            </>
          )}

          {/* ===== Nivel 2: contratos de una empresa ===== */}
          {nivel === "empresa" && (
            <>
              <div className="gc-head">
                <div>
                  <h2>{empresa?.name || "Empresa"}</h2>
                  <p>{empresa?.entity_type || "Entidad"} · {empresa?.nit || "Sin NIT"} · {contratosEmpresa.length} contrato(s)</p>
                </div>
                <div className="gc-actions">
                  {esAdmin && <button className="gc-btn ghost" onClick={() => setDrawerEmpresa(empresa)}><Settings size={15} /> Editar empresa</button>}
                  {esAdmin && <button className="gc-btn primary" onClick={() => { cargarDirectorio(); setDrawerContrato({ company_id: empresaId }); }}><Plus size={15} /> Nuevo contrato</button>}
                </div>
              </div>
              <section className="gc-card">
                <header className="gc-card-title"><h3>Contratos de la empresa</h3></header>
                {contratosEmpresa.length ? (
                  <div className="gc-grid c2">
                    {contratosEmpresa.map((c) => (
                      <button className="gc-item" key={c.id} onMouseEnter={() => precargar(`/api/gc/contracts/${c.id}`)} onClick={() => ir("contrato", c.id, "resumen")}>
                        <span className="ico"><Briefcase size={17} /></span>
                        <span className="txt">
                          <b>{c.title}</b>
                          <small>{c.code || "Sin código"} · {c.participantes} participante(s)</small>
                          <small style={{ marginTop: 5 }}><Estado valor={c.status} /></small>
                        </span>
                        <ChevronRight size={15} style={{ color: "var(--gc-muted)" }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Vacio icono={Briefcase} titulo="Esta empresa aún no tiene contratos"
                    texto="Crea el primer contrato para comenzar su seguimiento."
                    accion={esAdmin && <button className="gc-btn primary" onClick={() => { cargarDirectorio(); setDrawerContrato({ company_id: empresaId }); }}><Plus size={15} /> Nuevo contrato</button>} />
                )}
              </section>
            </>
          )}

          {/* ===== Nivel 3 y 4: contrato abierto ===== */}
          {nivel === "contrato" && (
            cargandoDetalle && !detalle ? <Cargando filas={5} />
            : !contrato ? <Vacio icono={Briefcase} titulo="Contrato no disponible" texto={error || "No tienes acceso a este contrato."}
                accion={<button className="gc-btn primary" onClick={() => ir()}>Volver</button>} />
            : (
              <>
                <section className="gc-contract-head">
                  <div className="gc-contract-top">
                    <span className="gc-contract-logo">{iniciales(contrato.company_name || contrato.entity_name || contrato.title)}</span>
                    <div className="gc-contract-id">
                      <h2>
                        {contrato.company_name || contrato.entity_name || contrato.title}
                        <Estado valor={contrato.status} />
                      </h2>
                      <p>
                        {contrato.code && <span className="code">{contrato.code}</span>}
                        {contrato.code ? " · " : ""}{contrato.title}
                      </p>
                    </div>
                    <div className="gc-actions">
                      <BotonExportar contratoId={contrato.id} seccion="completo" etiqueta="Informe PDF" />
                      {puede("CONTRACT_UPDATE") && (
                        <button className="gc-btn ghost" onClick={() => { cargarDirectorio(); setDrawerContrato({ ...contrato }); }}>
                          <Settings size={15} /> Editar
                        </button>
                      )}
                      {puede("CONTRACT_DELETE") && (
                        <button className="gc-btn danger" onClick={() => setConfirmar({ tipo: "contrato", id: contrato.id, titulo: contrato.title })}>
                          <Trash2 size={15} /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="gc-contract-meta">
                    <div><span>Supervisor</span><b>{contrato.responsible_name || "Sin asignar"}</b></div>
                    <div><span>Inicio</span><b>{fmtFecha(contrato.start_date)}</b></div>
                    <div><span>Terminación</span><b>{fmtFecha(contrato.end_date)}</b></div>
                    <div><span>Participantes</span><b>{detalle.avance?.participantes ?? 0}</b></div>
                    <div>
                      <span>Vigencia</span>
                      <b>{contrato.dias_para_vencer === null ? "Sin fecha"
                        : contrato.dias_para_vencer < 0 ? "Vencido"
                        : `${contrato.dias_para_vencer} días restantes`}</b>
                    </div>
                  </div>
                </section>

                <nav className="gc-tabs">
                  {tabsVisibles.map((t) => {
                    const I = t.icon;
                    return (
                      <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => ir("contrato", contrato.id, t.id)}>
                        <I size={15} /> {t.label}
                      </button>
                    );
                  })}
                </nav>

                {tab === "resumen" && <TabResumen detalle={detalle} avisar={avisar} ir={ir} />}
                {tab === "documentos" && <TabDocumentos contratoId={contrato.id} detalle={detalle} avisar={avisar} setVisor={setVisor} />}
                {tab === "evidencias" && <TabEvidencias contratoId={contrato.id} detalle={detalle} avisar={avisar} setVisor={setVisor} ruta={[param2]}
                  ir={(u) => navegar(["contrato", contrato.id, "evidencias", u], true)} />}
                {tab === "actividades" && <TabActividades contratoId={contrato.id} detalle={detalle} avisar={avisar} setVisor={setVisor}
                  seleccion={{ userId: param2 ? Number(param2) : null, year: param3 ? Number(param3) : null, month: param4 ? Number(param4) : null }}
                  ir={(u, y, m) => navegar(["contrato", contrato.id, "actividades", u, y, m], true)} />}
                {tab === "contratistas" && <TabContratistas contratoId={contrato.id} detalle={detalle} avisar={avisar} ir={ir} />}
                {tab === "reuniones" && <TabReuniones contratoId={contrato.id} detalle={detalle} avisar={avisar} setVisor={setVisor} />}
                {tab === "mesas" && <TabMesas contratoId={contrato.id} detalle={detalle} avisar={avisar} setVisor={setVisor} />}
                {tab === "solicitudes" && <TabSolicitudes contratoId={contrato.id} detalle={detalle} avisar={avisar} setVisor={setVisor} />}
                {tab === "historial" && <TabHistorial contratoId={contrato.id} detalle={detalle} />}
              </>
            )
          )}
        </main>
      </div>

      {/* ============ Formularios ============ */}
      <FormularioEmpresa
        datos={drawerEmpresa} guardando={guardando}
        onClose={() => setDrawerEmpresa(null)} onGuardar={guardarEmpresa}
        onEliminar={(id) => setConfirmar({ tipo: "empresa", id, titulo: drawerEmpresa?.name })}
        directorio={directorio} onAbrirDirectorio={cargarDirectorio}
      />
      <FormularioContrato
        datos={drawerContrato} guardando={guardando} empresas={ctx.empresas} directorio={directorio}
        onClose={() => setDrawerContrato(null)} onGuardar={guardarContrato}
      />

      <Confirmar
        abierto={!!confirmar}
        titulo={confirmar?.tipo === "contrato" ? "Eliminar contrato" : "Eliminar empresa"}
        texto={confirmar?.tipo === "contrato"
          ? `Se eliminará «${confirmar?.titulo}» junto con sus documentos, evidencias, actividades, anexos, informes e historial. Esta acción es permanente.`
          : `Se eliminará la empresa «${confirmar?.titulo}». Solo es posible si no tiene contratos asociados.`}
        etiqueta="Eliminar definitivamente"
        onClose={() => setConfirmar(null)}
        onConfirmar={async () => {
          if (confirmar.tipo === "contrato") return eliminarContrato(confirmar.id, confirmar.titulo);
          try {
            await api(`/api/gc/companies/${confirmar.id}`, { method: "DELETE" });
            invalidar("/api/gc/");
            avisar("Empresa eliminada");
            setConfirmar(null); setDrawerEmpresa(null);
            await cargarContexto(); ir();
          } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
        }}
      />

      <Visor item={visor} onClose={() => setVisor(null)} />
      <Toast toast={toast} />
    </div>
  );
}

/* ---------- Formularios de empresa y contrato ---------- */

function FormularioEmpresa({ datos, guardando, onClose, onGuardar, onEliminar, directorio, onAbrirDirectorio }) {
  const [f, setF] = useState({});
  useEffect(() => {
    if (datos) { setF({ status: "activa", ...datos }); onAbrirDirectorio?.(); }
  }, [datos]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!datos) return null;

  return (
    <Drawer abierto titulo={f.id ? "Editar empresa" : "Nueva empresa"}
      subtitulo="Los contratos se agrupan por empresa contratante." onClose={onClose}
      pie={
        <>
          {f.id && <button className="gc-btn danger" onClick={() => onEliminar(f.id)} style={{ marginRight: "auto" }}><Trash2 size={14} /> Eliminar</button>}
          <button className="gc-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !f.name?.trim()} onClick={() => onGuardar(f)}>
            {guardando ? "Guardando…" : "Guardar empresa"}
          </button>
        </>
      }>
      <div className="gc-form c2">
        <div className="gc-field gc-full">
          <label>Nombre de la empresa *</label>
          <input value={f.name || ""} onChange={set("name")} placeholder="Gobernación de Casanare" autoFocus />
        </div>
        <div className="gc-field"><label>NIT</label><input value={f.nit || ""} onChange={set("nit")} placeholder="892.099.216-6" /></div>
        <div className="gc-field">
          <label>Tipo de entidad</label>
          <select value={f.entity_type || ""} onChange={set("entity_type")}>
            <option value="">Sin especificar</option>
            <option value="Entidad pública">Entidad pública</option>
            <option value="Empresa privada">Empresa privada</option>
            <option value="Mixta">Mixta</option>
            <option value="ESE">ESE</option>
          </select>
        </div>
        <div className="gc-field">
          <label>Estado</label>
          <select value={f.status || "activa"} onChange={set("status")}>
            <option value="activa">Activa</option>
            <option value="en_revision">En revisión</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>
        <div className="gc-field">
          <label>Responsable interno</label>
          <select value={f.internal_responsible_id || ""} onChange={set("internal_responsible_id")}>
            <option value="">Sin asignar</option>
            {directorio.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div className="gc-field"><label>Próxima revisión</label><input type="date" value={f.next_review_date || ""} onChange={set("next_review_date")} /></div>
        <div className="gc-field gc-full"><label>Notas</label><textarea value={f.notes || ""} onChange={set("notes")} placeholder="Contexto de la relación con la empresa…" /></div>
      </div>
    </Drawer>
  );
}

function FormularioContrato({ datos, guardando, empresas, directorio, onClose, onGuardar }) {
  const [f, setF] = useState({});
  useEffect(() => { if (datos) setF({ status: "activo", ...datos }); }, [datos]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!datos) return null;

  return (
    <Drawer abierto titulo={f.id ? "Editar contrato" : "Nuevo contrato"}
      subtitulo="Datos generales. Los participantes y requisitos se configuran dentro del contrato." onClose={onClose}
      pie={
        <>
          <button className="gc-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !f.title?.trim()} onClick={() => onGuardar(f)}>
            {guardando ? "Guardando…" : "Guardar contrato"}
          </button>
        </>
      }>
      <div className="gc-form c2">
        <div className="gc-field gc-full">
          <label>Nombre del contrato *</label>
          <input value={f.title || ""} onChange={set("title")} placeholder="Suministro de equipos médicos" autoFocus />
        </div>
        <div className="gc-field"><label>Código</label><input value={f.code || ""} onChange={set("code")} placeholder="CON-001-2026" /></div>
        <div className="gc-field">
          <label>Empresa contratante</label>
          <select value={f.company_id || ""} onChange={set("company_id")}>
            <option value="">Sin empresa</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="gc-field"><label>Fecha de inicio</label><input type="date" value={f.start_date || ""} onChange={set("start_date")} /></div>
        <div className="gc-field"><label>Fecha de terminación</label><input type="date" value={f.end_date || ""} onChange={set("end_date")} /></div>
        <div className="gc-field">
          <label>Supervisor</label>
          <select value={f.internal_responsible_id || ""} onChange={set("internal_responsible_id")}>
            <option value="">Sin asignar</option>
            {directorio.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <span className="hint">El supervisor puede revisar y aprobar sin ser administrador.</span>
        </div>
        <div className="gc-field">
          <label>Estado</label>
          <select value={f.status || "activo"} onChange={set("status")}>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
            <option value="finalizado">Finalizado</option>
            <option value="archivado">Archivado</option>
          </select>
        </div>
        <div className="gc-field gc-full"><label>Objeto contractual</label><textarea value={f.object || ""} onChange={set("object")} placeholder="Objeto del contrato…" /></div>
        <div className="gc-field gc-full"><label>Descripción / alcance</label><textarea value={f.description || ""} onChange={set("description")} placeholder="Alcance y condiciones…" /></div>
      </div>
    </Drawer>
  );
}
