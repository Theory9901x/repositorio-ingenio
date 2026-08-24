"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Bell, BookMarked, Bookmark, Check, ChevronRight, Clock, Menu,
  FileText, Flame, FolderOpen, Hash, Heart, Home, Layers, Lightbulb, Lock, MessageCircle,
  MessageSquare, Paperclip, Pin, Plus, Search, Send, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { api, enviarForm, enviarJson } from "../gc/api";
import { invalidar, pedir, enCache } from "../gc/cache";
import { fmtTam, iniciales, IconoArchivo, tipoArchivo } from "../gc/ui";
import PanelConversacion from "./PanelConversacion";
import CrearPublicacion from "./CrearPublicacion";
import Directorio from "./Directorio";

const ICONO_CAT = { todo: Layers, general: MessageSquare, pregunta: Lightbulb, conocimiento: FileText, proyecto: FolderOpen, anuncio: Bell };
const ICONO_METRICA = { conversaciones: MessageSquare, comentarios: MessageCircle, reacciones: Heart, personas: Users };
const ACENTO = { conversaciones: ["#4a67ff", "rgba(74,103,255,.12)"], comentarios: ["#7b5cfa", "rgba(123,92,250,.12)"], reacciones: ["#e2445f", "rgba(226,68,95,.12)"], personas: ["#15a97a", "rgba(21,169,122,.13)"] };
const ORDENES = [["recientes", "Más recientes", Clock], ["populares", "Más populares", Flame], ["sin_responder", "Sin responder", MessageCircle]];

// Convierte @menciones en texto resaltado sin permitir HTML del usuario.
export function conMenciones(texto) {
  const partes = String(texto || "").split(/(@[\p{L}\p{N}._-]{3,40})/gu);
  return partes.map((p, i) => p.startsWith("@")
    ? <span className="mencion" key={i}>{p}</span>
    : <span key={i}>{p}</span>);
}

export function fechaRelativa(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "Ahora mismo";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function Avatar({ persona, tam = "" }) {
  const id = persona?.id ?? persona?.author_id;
  const foto = persona?.has_photo ?? persona?.author_photo;
  const nombre = persona?.full_name || persona?.author_name;
  return (
    <span className={`cm-av ${tam}`}>
      {foto ? <img src={`/api/profile/photo/${id}`} alt="" /> : iniciales(nombre)}
    </span>
  );
}

export default function Comunidad() {
  const router = useRouter();
  const [ctx, setCtx] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [posts, setPosts] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ tipo: "todo", etiqueta: null, orden: "recientes", q: "", guardados: false });
  const [busqueda, setBusqueda] = useState("");

  const [abierta, setAbierta] = useState(null);
  const [crear, setCrear] = useState(null);
  const [directorio, setDirectorio] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false); // cajón lateral en móvil
  const [menu, setMenu] = useState(null);
  const buscador = useRef(null);

  const avisar = useCallback((msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), tipo === "error" ? 4800 : 2600);
  }, []);

  const cargarContexto = useCallback(async (forzar = false) => {
    try { setCtx(await pedir("/api/cm/context", { refrescar: forzar })); setError(null); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargarContexto(); }, [cargarContexto]);

  // Si la URL trae ?post=ID (p. ej. desde una notificación), se abre directo.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("post"));
    if (!id) return;
    (async () => {
      try { const det = await api(`/api/cm/posts/${id}`); setAbierta(det.post); }
      catch { /* la publicación pudo ser eliminada */ }
      window.history.replaceState({}, "", "/comunidad");
    })();
  }, []);

  // Búsqueda con retardo para no consultar en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setFiltros((f) => ({ ...f, q: busqueda.trim() })), 320);
    return () => clearTimeout(id);
  }, [busqueda]);

  const cargarPosts = useCallback(async (pag = 1, acumular = false) => {
    const p = new URLSearchParams();
    if (filtros.tipo && filtros.tipo !== "todo") p.set("tipo", filtros.tipo);
    if (filtros.etiqueta) p.set("etiqueta", filtros.etiqueta);
    if (filtros.orden) p.set("orden", filtros.orden);
    if (filtros.q) p.set("q", filtros.q);
    if (filtros.guardados) p.set("guardados", "1");
    p.set("pagina", String(pag));
    const url = `/api/cm/posts?${p}`;
    // Si la categoría ya se visitó, se pinta desde la caché sin esperar la red
    // y se revalida en segundo plano.
    const guardado = acumular ? null : enCache(url);
    if (guardado) { setPosts(guardado.posts); setHayMas(guardado.hayMas); setPagina(pag); }
    else if (!acumular) setPosts(null); // sin caché se muestra el esqueleto
    try {
      const d = await pedir(url, { refrescar: !!guardado });
      setPosts((prev) => (acumular && prev ? [...prev, ...d.posts] : d.posts));
      setHayMas(d.hayMas);
      setPagina(pag);
    } catch (e) {
      if (!guardado) { avisar(e.message, "error"); setPosts([]); }
    }
  }, [filtros, avisar]);

  // Al cambiar de filtro solo se vacía la lista si no hay nada en caché,
  // para no provocar un parpadeo innecesario.
  useEffect(() => { cargarPosts(1); }, [cargarPosts]);

  useEffect(() => {
    const cerrar = (e) => { if (!e.target.closest?.(".cm-post-menu")) setMenu(null); };
    const atajo = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); buscador.current?.focus(); }
      if (e.key === "Escape") { setAbierta(null); setMenu(null); }
    };
    document.addEventListener("click", cerrar);
    document.addEventListener("keydown", atajo);
    return () => { document.removeEventListener("click", cerrar); document.removeEventListener("keydown", atajo); };
  }, []);

  // Actualiza una publicación en la lista sin recargar todo el feed.
  const actualizarPost = useCallback((id, cambios) => {
    setPosts((prev) => prev?.map((p) => (p.id === id ? { ...p, ...cambios } : p)) ?? prev);
    setAbierta((a) => (a?.id === id ? { ...a, ...cambios } : a));
  }, []);

  async function alternar(post, accion) {
    const previo = { reaccionado: post.reaccionado, reacciones: post.reacciones, guardado: post.guardado, is_pinned: post.is_pinned };
    // Actualización optimista: la interfaz responde de inmediato.
    if (accion === "reaccionar") {
      actualizarPost(post.id, { reaccionado: !post.reaccionado, reacciones: Number(post.reacciones) + (post.reaccionado ? -1 : 1) });
    } else if (accion === "guardar") {
      actualizarPost(post.id, { guardado: !post.guardado });
    } else if (accion === "fijar") {
      actualizarPost(post.id, { is_pinned: post.is_pinned ? 0 : 1 });
    }
    try {
      await enviarJson(`/api/cm/posts/${post.id}`, "PATCH", { accion });
      if (accion === "fijar") { invalidar("/api/cm/"); cargarPosts(1); }
      if (accion === "guardar") { invalidar("/api/cm/"); cargarContexto(true); }
    } catch (e) {
      actualizarPost(post.id, previo); // se revierte si el servidor rechaza
      avisar(e.message, "error");
    }
  }

  async function cerrarConversacion(post) {
    try {
      const r = await enviarJson(`/api/cm/posts/${post.id}`, "PATCH", { accion: "cerrar" });
      invalidar("/api/cm/");
      avisar(r.cerrado ? "Conversación cerrada" : "Conversación reabierta");
      cargarPosts(1);
      if (abierta?.id === post.id) setAbierta({ ...abierta, closed_at: r.cerrado ? new Date().toISOString() : null });
    } catch (e) { avisar(e.message, "error"); }
  }

  async function eliminarPost(post) {
    if (!confirm(`¿Eliminar «${post.title}»? Se borrarán sus comentarios y adjuntos.`)) return;
    try {
      await api(`/api/cm/posts/${post.id}`, { method: "DELETE" });
      invalidar("/api/cm/");
      avisar("Publicación eliminada");
      if (abierta?.id === post.id) setAbierta(null);
      cargarPosts(1); cargarContexto(true);
    } catch (e) { avisar(e.message, "error"); }
  }

  if (cargando) return <div className="cm-loading"><span className="cm-spin" /> Cargando Comunidad…</div>;
  if (!ctx) {
    return (
      <div className="cm-loading" style={{ flexDirection: "column", gap: 15 }}>
        <span>{error || "Debes iniciar sesión."}</span>
        <a className="cm-btn primary" href="/">Volver al repositorio</a>
      </div>
    );
  }

  const puede = (p) => ctx.permisos.includes(p);
  const categoriaActual = ctx.categorias.find((c) => c.slug === filtros.tipo);

  return (
    <div className="cm">
      {/* Sidebar global */}
      {menuAbierto && <div className="movil-tapa" onClick={() => setMenuAbierto(false)} />}
      <aside className={`cm-side${menuAbierto ? " abierto" : ""}`}>
        <div className="cm-brand">
          <span className="cm-brand-mark"><img src="/branding/logo-grupo-ingenio.png" alt="Grupo Ingenio" /></span>
          <div><h1>Grupo Ingenio</h1><p>Gestión documental</p></div>
        </div>
        <nav className="cm-nav">
          <button className="on"><MessageSquare size={17} /> Comunidad</button>
          <button onClick={() => (location.href = "/gestion-contractual")}><Layers size={17} /> Contratos / Rutas</button>
          <button onClick={() => (location.href = "/workspace")}><FolderOpen size={17} /> Mi espacio / Plan</button>
          <button onClick={() => router.push("/")}><ArrowLeft size={17} /> Volver al repositorio</button>
        </nav>
        <div className="cm-side-user">
          <Avatar persona={ctx.me} tam="sm" />
          <div>
            <strong>{ctx.me.full_name}</strong>
            <span>{ctx.me.cargo || "Miembro"}</span>
          </div>
        </div>
      </aside>

      <div className="cm-main">
        <header className="cm-top">
          <button className="movil-menu" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"><Menu size={19} /></button>
          <div className="cm-search">
            <Search size={15} />
            <input ref={buscador} value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar conversaciones, personas, temas o documentos..." />
            <kbd>Ctrl K</kbd>
          </div>
          <button className="cm-topbtn" title="Mis guardados"
            onClick={() => setFiltros((f) => ({ ...f, guardados: !f.guardados, etiqueta: null }))}>
            <Bookmark size={17} style={filtros.guardados ? { fill: "currentColor", color: "var(--cm-blue)" } : undefined} />
          </button>
          <button className="cm-topbtn" title="Notificaciones" onClick={() => (location.href = "/")}><Bell size={17} /></button>
          <Avatar persona={ctx.me} tam="sm" />
        </header>

        <main className="cm-body">
          <div className="cm-head">
            <div>
              <h2>Comunidad</h2>
              <p>Conecta con tu equipo, comparte conocimiento y construye soluciones juntos.</p>
            </div>
            <div className="cm-actions">
              <button className="cm-btn ghost" onClick={() => setDirectorio(true)}><Users size={15} /> Directorio del equipo</button>
              {puede("POST_CREATE") && (
                <button className="cm-btn primary" onClick={() => setCrear({ type: "general" })}><Plus size={15} /> Crear publicación</button>
              )}
            </div>
          </div>

          <section className="cm-stats">
            {ctx.metricas.map((m) => {
              const I = ICONO_METRICA[m.id] || MessageSquare;
              const [acc, tint] = ACENTO[m.id] || ["#4a67ff", "rgba(74,103,255,.12)"];
              return (
                <article className="cm-stat" key={m.id} style={{ "--acc": acc, "--tint": tint }}>
                  <span className="ico"><I size={17} /></span>
                  <div><strong>{m.valor}</strong><span>{m.label}</span></div>
                </article>
              );
            })}
          </section>

          <nav className="cm-tabs">
            {ctx.categorias.map((c) => {
              const I = ICONO_CAT[c.slug] || MessageSquare;
              return (
                <button key={c.slug} className={filtros.tipo === c.slug && !filtros.guardados ? "on" : ""}
                  onClick={() => setFiltros((f) => ({ ...f, tipo: c.slug, guardados: false }))}>
                  <I size={15} /> {c.nombre}
                </button>
              );
            })}
          </nav>

          <div className={`cm-grid ${abierta ? "con-panel" : ""}`}>
            {/* Zona 1: navegación de comunidad */}
            <div className="cm-col cm-lateral">
              <section className="cm-card">
                <h3>Categorías</h3>
                <div className="cm-catlist">
                  {ctx.categorias.map((c) => {
                    const I = ICONO_CAT[c.slug] || MessageSquare;
                    return (
                      <button key={c.slug} className={filtros.tipo === c.slug && !filtros.guardados ? "on" : ""}
                        onClick={() => setFiltros((f) => ({ ...f, tipo: c.slug, guardados: false }))}>
                        <I size={14} /> {c.nombre} <span className="n">{c.total}</span>
                      </button>
                    );
                  })}
                  {ctx.guardados > 0 && (
                    <button className={filtros.guardados ? "on" : ""} onClick={() => setFiltros((f) => ({ ...f, guardados: true, etiqueta: null }))}>
                      <BookMarked size={14} /> Mis guardados <span className="n">{ctx.guardados}</span>
                    </button>
                  )}
                </div>
              </section>

              {ctx.etiquetas.length > 0 && (
                <section className="cm-card">
                  <h3>
                    Etiquetas populares
                    {filtros.etiqueta && <button className="link" onClick={() => setFiltros((f) => ({ ...f, etiqueta: null }))}>Limpiar</button>}
                  </h3>
                  <div className="cm-tags">
                    {ctx.etiquetas.map((t) => (
                      <button key={t.slug} className={`cm-tag ${filtros.etiqueta === t.slug ? "on" : ""}`}
                        onClick={() => setFiltros((f) => ({ ...f, etiqueta: f.etiqueta === t.slug ? null : t.slug }))}>
                        <Hash size={11} />{t.name}<span className="n">{t.total}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="cm-card">
                <h3>Ordenar por</h3>
                <div className="cm-orden">
                  {ORDENES.map(([id, etiqueta, I]) => (
                    <button key={id} className={filtros.orden === id ? "on" : ""} onClick={() => setFiltros((f) => ({ ...f, orden: id }))}>
                      <I size={14} /> {etiqueta}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Zona 2: feed */}
            <div className="cm-col">
              {puede("POST_CREATE") && (
                <div className="cm-composer">
                  <Avatar persona={ctx.me} />
                  <button className="campo" onClick={() => setCrear({ type: "general" })}>¿Qué quieres compartir con tu equipo?</button>
                  <button className="cm-btn primary" onClick={() => setCrear({ type: "general" })}>Publicar</button>
                </div>
              )}

              {filtros.guardados && (
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--cm-violet)", display: "flex", alignItems: "center", gap: 7 }}>
                  <BookMarked size={14} /> Mostrando tus conversaciones guardadas
                  <button className="cm-btn ghost" style={{ marginLeft: "auto", padding: "6px 12px" }}
                    onClick={() => setFiltros((f) => ({ ...f, guardados: false }))}>Ver todo</button>
                </div>
              )}

              {posts === null ? (
                <div>{[1, 2, 3].map((i) => <div className="cm-skel" key={i} />)}</div>
              ) : posts.length ? (
                <>
                  {posts.map((p) => (
                    <Publicacion key={p.id} post={p} yo={ctx.me} permisos={ctx.permisos}
                      activa={abierta?.id === p.id} menu={menu} setMenu={setMenu}
                      onAbrir={() => setAbierta(p)} onAlternar={alternar}
                      onCerrar={cerrarConversacion} onEliminar={eliminarPost}
                      onEtiqueta={(slug) => setFiltros((f) => ({ ...f, etiqueta: slug, guardados: false }))} />
                  ))}
                  {hayMas && (
                    <button className="cm-btn ghost" style={{ justifyContent: "center" }} onClick={() => cargarPosts(pagina + 1, true)}>
                      Cargar más conversaciones
                    </button>
                  )}
                </>
              ) : (
                <div className="cm-empty">
                  <div className="ico"><MessageSquare size={21} /></div>
                  <h3>
                    {filtros.guardados ? "No has guardado conversaciones"
                      : filtros.q ? "Sin resultados para tu búsqueda"
                      : filtros.etiqueta ? "No hay conversaciones con esta etiqueta"
                      : `No hay conversaciones en ${categoriaActual?.nombre || "esta categoría"}`}
                  </h3>
                  <p>{filtros.guardados ? "Guarda una conversación para volver a ella después."
                    : "Sé el primero en compartir algo con tu equipo."}</p>
                  {puede("POST_CREATE") && !filtros.guardados && (
                    <button className="cm-btn primary" onClick={() => setCrear({ type: filtros.tipo === "todo" ? "general" : filtros.tipo })}>
                      <Plus size={15} /> Crear publicación
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Zona 3: contexto */}
            {!abierta && (
              <div className="cm-col cm-contexto">
                {ctx.destacadas.length > 0 && (
                  <section className="cm-card">
                    <h3>Conversaciones destacadas</h3>
                    <div>
                      {ctx.destacadas.map((d, i) => (
                        <button className="cm-dest" key={d.id} onClick={async () => {
                          try { const det = await api(`/api/cm/posts/${d.id}`); setAbierta(det.post); }
                          catch (e) { avisar(e.message, "error"); }
                        }}>
                          <span className="num">{i + 1}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b>{d.title}</b>
                            <span>{ctx.categorias.find((c) => c.slug === d.type)?.nombre || d.type} · {d.comentarios} comentarios</span>
                          </span>
                          {!!d.is_pinned && <Pin size={12} style={{ color: "var(--cm-warn)", flexShrink: 0 }} />}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {ctx.etiquetas.length > 0 && (
                  <section className="cm-card">
                    <h3>Temas populares</h3>
                    <div style={{ display: "grid", gap: 3 }}>
                      {ctx.etiquetas.slice(0, 5).map((t) => (
                        <button key={t.slug} className="cm-dest" style={{ padding: "7px 8px" }}
                          onClick={() => setFiltros((f) => ({ ...f, etiqueta: t.slug, guardados: false }))}>
                          <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--cm-violet)" }}>
                            <Hash size={12} />{t.name}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--cm-muted)" }}>{t.total}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="cm-card">
                  <h3>Miembros activos <button className="link" onClick={() => setDirectorio(true)}>Ver todos</button></h3>
                  <div className="cm-miembros">
                    {ctx.miembros.slice(0, 6).map((m) => <Avatar key={m.id} persona={m} tam="sm" />)}
                    {ctx.miembros.length > 6 && <span className="mas">+{ctx.miembros.length - 6}</span>}
                  </div>
                </section>
              </div>
            )}

            {/* Zona 4: conversación abierta */}
            {abierta && (
              <PanelConversacion
                post={abierta} yo={ctx.me} permisos={ctx.permisos} categorias={ctx.categorias}
                miembros={ctx.miembros} avisar={avisar}
                onCerrarPanel={() => setAbierta(null)}
                onAlternar={alternar} onCerrarConversacion={cerrarConversacion} onEliminar={eliminarPost}
                onCambio={(cambios) => actualizarPost(abierta.id, cambios)}
              />
            )}
          </div>
        </main>
      </div>

      {crear && (
        <CrearPublicacion
          inicial={crear} rol={ctx.rol} categorias={ctx.categorias} miembros={ctx.miembros}
          onClose={() => setCrear(null)}
          onCreada={() => { setCrear(null); invalidar("/api/cm/"); avisar("Publicación creada"); cargarPosts(1); cargarContexto(true); }}
          avisar={avisar}
        />
      )}
      {directorio && <Directorio onClose={() => setDirectorio(false)} avisar={avisar} />}

      {toast && (
        <div className={`cm-toast ${toast.tipo === "error" ? "error" : ""}`}>
          {toast.tipo === "error" ? <AlertCircle size={16} /> : <Check size={16} />} {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------- Tarjeta de publicación ---------- */
function Publicacion({ post, yo, permisos, activa, menu, setMenu, onAbrir, onAlternar, onCerrar, onEliminar, onEtiqueta }) {
  const propio = Number(post.author_id) === Number(yo.id);
  const puedeModerar = permisos.includes("POST_DELETE_ANY") || propio;
  const resuelta = post.type === "pregunta" && post.accepted_comment_id;

  return (
    <article className={`cm-post ${activa ? "on" : ""} ${post.is_pinned ? "fijado" : ""}`} onClick={onAbrir}>
      <header className="cm-post-head">
        <Avatar persona={post} />
        <div className="who">
          <b>{post.author_name}</b>
          <span>{post.author_cargo || "Miembro"} · {fechaRelativa(post.created_at)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {!!post.is_pinned && <span className="cm-badge anuncio"><Pin size={10} /> Fijado</span>}
          {resuelta && <span className="cm-badge resuelta"><Check size={10} /> Resuelta</span>}
          {post.closed_at && <span className="cm-badge cerrada"><Lock size={10} /> Cerrada</span>}
          <span className={`cm-badge ${post.type}`}>{TIPO_ETIQUETA[post.type] || post.type}</span>
        </div>
        {puedeModerar && (
          <div className="cm-post-menu" onClick={(e) => e.stopPropagation()}>
            <button className="cm-icbtn" onClick={() => setMenu(menu === post.id ? null : post.id)}>⋯</button>
            {menu === post.id && (
              <div className="cm-menu">
                {permisos.includes("POST_PIN") && (
                  <button onClick={() => { setMenu(null); onAlternar(post, "fijar"); }}>
                    <Pin size={14} /> {post.is_pinned ? "Quitar fijado" : "Fijar publicación"}
                  </button>
                )}
                {(permisos.includes("POST_CLOSE") || propio) && (
                  <button onClick={() => { setMenu(null); onCerrar(post); }}>
                    <Lock size={14} /> {post.closed_at ? "Reabrir conversación" : "Cerrar conversación"}
                  </button>
                )}
                <button onClick={() => { setMenu(null); navigator.clipboard?.writeText(`${location.origin}/comunidad#post-${post.id}`); }}>
                  <Paperclip size={14} /> Copiar enlace
                </button>
                <button className="danger" onClick={() => { setMenu(null); onEliminar(post); }}><Trash2 size={14} /> Eliminar</button>
              </div>
            )}
          </div>
        )}
      </header>

      <h4>{post.title}</h4>
      <p>{post.body}</p>

      {post.etiquetas?.length > 0 && (
        <div className="cm-tags" style={{ marginTop: 11 }} onClick={(e) => e.stopPropagation()}>
          {post.etiquetas.map((t) => (
            <button key={t.slug} className="cm-tag" onClick={() => onEtiqueta(t.slug)}><Hash size={11} />{t.name}</button>
          ))}
        </div>
      )}

      <footer className="cm-post-foot" onClick={(e) => e.stopPropagation()}>
        <button className={`cm-act ${post.reaccionado ? "on" : ""}`} onClick={() => onAlternar(post, "reaccionar")}>
          <Heart size={15} /> {post.reacciones}
        </button>
        <button className="cm-act" onClick={onAbrir}>
          <MessageCircle size={15} /> {post.comentarios}
          {post.type === "pregunta" && Number(post.comentarios) === 0 && <span style={{ color: "var(--cm-warn)" }}>Sin responder</span>}
        </button>
        {Number(post.adjuntos) > 0 && <span className="cm-act"><Paperclip size={15} /> {post.adjuntos}</span>}
        <button className={`cm-act ${post.guardado ? "guardado" : ""}`} style={{ marginLeft: "auto" }} onClick={() => onAlternar(post, "guardar")}>
          <Bookmark size={15} /> {post.guardado ? "Guardado" : "Guardar"}
        </button>
      </footer>
    </article>
  );
}

export const TIPO_ETIQUETA = { general: "General", pregunta: "Pregunta", conocimiento: "Conocimiento", proyecto: "Proyecto", anuncio: "Anuncio" };
