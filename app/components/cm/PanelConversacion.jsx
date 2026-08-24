"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtSign, Bookmark, Check, CornerDownRight, Download, Eye, Heart, Lock, MessageCircle,
  Paperclip, Pin, Send, Trash2, X,
} from "lucide-react";
import { api, enviarForm, enviarJson } from "../gc/api";
import { IconoArchivo, Visor, fmtTam } from "../gc/ui";
import { Avatar, TIPO_ETIQUETA, conMenciones, fechaRelativa } from "./Comunidad";

const urlAdjunto = (id, descargar) => `/api/cm/file?id=${id}${descargar ? "&download=1" : ""}`;

export default function PanelConversacion({
  post, yo, permisos, categorias, miembros, avisar,
  onCerrarPanel, onAlternar, onCerrarConversacion, onEliminar, onCambio,
}) {
  const [detalle, setDetalle] = useState(null);
  const [comentarios, setComentarios] = useState(null);
  const [orden, setOrden] = useState("recientes");
  const [texto, setTexto] = useState("");
  const [respondiendo, setRespondiendo] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [visor, setVisor] = useState(null);
  const areaRef = useRef(null);

  const propio = Number(post.author_id) === Number(yo.id);
  const cerrada = !!post.closed_at;

  const cargar = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        api(`/api/cm/posts/${post.id}`),
        api(`/api/cm/posts/${post.id}/comments?orden=${orden === "valoradas" ? "valoradas" : "recientes"}`),
      ]);
      setDetalle(d);
      setComentarios(c.comentarios);
    } catch (e) { avisar(e.message, "error"); setComentarios([]); }
  }, [post.id, orden, avisar]);

  useEffect(() => { setDetalle(null); setComentarios(null); cargar(); }, [cargar]);

  async function comentar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setEnviando(true);
    try {
      if (archivos.length) {
        const fd = new FormData();
        fd.set("body", cuerpo);
        if (respondiendo) fd.set("parent_id", respondiendo.id);
        for (const f of archivos) fd.append("files", f);
        await enviarForm(`/api/cm/posts/${post.id}/comments`, "POST", fd);
      } else {
        await enviarJson(`/api/cm/posts/${post.id}/comments`, "POST", { body: cuerpo, parent_id: respondiendo?.id || null });
      }
      setTexto(""); setArchivos([]); setRespondiendo(null);
      onCambio({ comentarios: Number(post.comentarios || 0) + 1 });
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setEnviando(false); }
  }

  async function reaccionarComentario(c) {
    try {
      const r = await enviarJson(`/api/cm/comments/${c.id}`, "PATCH", { accion: "reaccionar" });
      setComentarios((prev) => actualizarEnArbol(prev, c.id, (x) => ({
        ...x, reaccionado: r.reaccionado, reacciones: Number(x.reacciones) + (r.reaccionado ? 1 : -1),
      })));
    } catch (e) { avisar(e.message, "error"); }
  }

  async function aceptar(c) {
    try {
      const r = await enviarJson(`/api/cm/comments/${c.id}`, "PATCH", { accion: "aceptar" });
      avisar(r.aceptada ? "Respuesta marcada como aceptada" : "Se retiró la respuesta aceptada");
      onCambio({ accepted_comment_id: r.aceptada ? c.id : null });
      cargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  async function eliminarComentario(c) {
    if (!confirm("¿Eliminar este comentario y sus respuestas?")) return;
    try {
      await api(`/api/cm/comments/${c.id}`, { method: "DELETE" });
      avisar("Comentario eliminado");
      cargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  const total = comentarios ? comentarios.reduce((n, c) => n + 1 + (c.respuestas?.length || 0), 0) : post.comentarios;

  return (
    <>
      <aside className="cm-panel">
        <header className="cm-panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
              <span className={`cm-badge ${post.type}`}>{TIPO_ETIQUETA[post.type] || post.type}</span>
              {!!post.is_pinned && <span className="cm-badge anuncio"><Pin size={10} /> Fijado</span>}
              {cerrada && <span className="cm-badge cerrada"><Lock size={10} /> Cerrada</span>}
              {post.type === "pregunta" && post.accepted_comment_id && <span className="cm-badge resuelta"><Check size={10} /> Resuelta</span>}
            </div>
            <h3>{post.title}</h3>
          </div>
          <button className="cm-icbtn" onClick={onCerrarPanel} aria-label="Cerrar"><X size={17} /></button>
        </header>

        <div className="cm-panel-body">
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar persona={post} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{post.author_name}</b>
              <span style={{ fontSize: 11, color: "var(--cm-muted)", fontWeight: 700 }}>
                {post.author_cargo || "Miembro"} · {fechaRelativa(post.created_at)}
              </span>
            </div>
          </div>

          <div className="cm-contenido">{conMenciones(detalle?.post?.body ?? post.body)}</div>

          {detalle?.etiquetas?.length > 0 && (
            <div className="cm-tags">
              {detalle.etiquetas.map((t) => <span className="cm-tag" key={t.slug} style={{ cursor: "default" }}>#{t.name}</span>)}
            </div>
          )}

          {detalle?.adjuntos?.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {detalle.adjuntos.map((a) => <Adjunto key={a.id} adjunto={a} onVer={setVisor} autor={post.author_name} />)}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4, borderTop: "1px solid var(--cm-line)" }}>
            <button className={`cm-act ${post.reaccionado ? "on" : ""}`} onClick={() => onAlternar(post, "reaccionar")}>
              <Heart size={15} /> {post.reacciones} Me gusta
            </button>
            <span className="cm-act"><MessageCircle size={15} /> {total}</span>
            <button className={`cm-act ${post.guardado ? "guardado" : ""}`} onClick={() => onAlternar(post, "guardar")}>
              <Bookmark size={15} /> {post.guardado ? "Guardado" : "Guardar"}
            </button>
            {(permisos.includes("POST_CLOSE") || propio) && (
              <button className="cm-act" style={{ marginLeft: "auto" }} onClick={() => onCerrarConversacion(post)}>
                <Lock size={15} /> {cerrada ? "Reabrir" : "Cerrar"}
              </button>
            )}
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque'", fontSize: 14, fontWeight: 800, margin: 0 }}>
                {post.type === "pregunta" ? "Respuestas" : "Comentarios"} ({total})
              </h3>
              <select className="cm-btn ghost" style={{ padding: "6px 10px", fontSize: 11.5 }} value={orden} onChange={(e) => setOrden(e.target.value)}>
                <option value="recientes">Más recientes</option>
                <option value="valoradas">Más valoradas</option>
              </select>
            </div>

            {comentarios === null ? (
              <div style={{ display: "grid", gap: 8 }}>{[1, 2].map((i) => <div className="cm-skel" style={{ height: 62 }} key={i} />)}</div>
            ) : comentarios.length ? (
              comentarios.map((c) => (
                <Comentario key={c.id} c={c} post={post} yo={yo} permisos={permisos}
                  onReaccionar={reaccionarComentario} onAceptar={aceptar} onEliminar={eliminarComentario}
                  onResponder={(x) => { setRespondiendo(x); areaRef.current?.focus(); }}
                  onVerAdjunto={setVisor} cerrada={cerrada} />
              ))
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--cm-muted)", fontWeight: 700, margin: "10px 0" }}>
                {post.type === "pregunta" ? "Todavía nadie ha respondido. Sé el primero en ayudar." : "Sé el primero en comentar."}
              </p>
            )}
          </div>
        </div>

        <footer className="cm-panel-foot">
          {respondiendo && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: "var(--cm-violet)", marginBottom: 8 }}>
              <CornerDownRight size={13} /> Respondiendo a {respondiendo.author_name}
              <button className="cm-icbtn" style={{ width: 22, height: 22 }} onClick={() => setRespondiendo(null)}><X size={12} /></button>
            </div>
          )}
          {cerrada ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--cm-muted)", fontWeight: 700, textAlign: "center" }}>
              Esta conversación está cerrada y ya no admite comentarios.
            </p>
          ) : (
            <CampoComentario
              texto={texto} setTexto={setTexto} areaRef={areaRef} miembros={miembros}
              archivos={archivos} setArchivos={setArchivos} enviando={enviando} onEnviar={comentar}
            />
          )}
        </footer>
      </aside>

      <Visor item={visor} onClose={() => setVisor(null)} />
    </>
  );
}

/* ---------- Comentario con un nivel de respuestas ---------- */
function Comentario({ c, post, yo, permisos, onReaccionar, onAceptar, onEliminar, onResponder, onVerAdjunto, cerrada, anidado }) {
  const propio = Number(c.author_id) === Number(yo.id);
  const puedeEliminar = propio || permisos.includes("COMMENT_DELETE_ANY");
  const esAutorTema = Number(post.author_id) === Number(yo.id);
  const puedeAceptar = post.type === "pregunta" && !propio && (esAutorTema || permisos.includes("MODERATE"));

  return (
    <>
      <div className={`cm-coment ${c.is_accepted ? "aceptada" : ""}`}>
        <Avatar persona={c} tam={anidado ? "xs" : "sm"} />
        <div className="cm-coment-body">
          <div className="meta">
            <b>{c.author_name}</b>
            <span>{c.author_cargo || "Miembro"} · {fechaRelativa(c.created_at)}</span>
            {!!c.is_accepted && <span className="cm-badge resuelta"><Check size={10} /> Respuesta aceptada</span>}
          </div>
          <p>{conMenciones(c.body)}</p>

          {c.adjuntos?.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {c.adjuntos.map((a) => <Adjunto key={a.id} adjunto={a} onVer={onVerAdjunto} autor={c.author_name} compacto />)}
            </div>
          )}

          <div className="cm-coment-acts">
            <button className={`cm-act ${c.reaccionado ? "on" : ""}`} onClick={() => onReaccionar(c)}>
              <Heart size={13} /> {c.reacciones}
            </button>
            {!anidado && !cerrada && (
              <button className="cm-act" onClick={() => onResponder(c)}><CornerDownRight size={13} /> Responder</button>
            )}
            {puedeAceptar && (
              <button className="cm-act" onClick={() => onAceptar(c)} style={c.is_accepted ? { color: "var(--cm-ok)" } : undefined}>
                <Check size={13} /> {c.is_accepted ? "Quitar aceptada" : "Aceptar respuesta"}
              </button>
            )}
            {puedeEliminar && (
              <button className="cm-act" onClick={() => onEliminar(c)} style={{ marginLeft: "auto" }}><Trash2 size={13} /></button>
            )}
          </div>
        </div>
      </div>

      {c.respuestas?.length > 0 && (
        <div className="cm-respuestas">
          {c.respuestas.map((r) => (
            <Comentario key={r.id} c={r} post={post} yo={yo} permisos={permisos} anidado
              onReaccionar={onReaccionar} onAceptar={onAceptar} onEliminar={onEliminar}
              onResponder={onResponder} onVerAdjunto={onVerAdjunto} cerrada={cerrada} />
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Adjunto ---------- */
function Adjunto({ adjunto, onVer, autor, compacto }) {
  return (
    <div className="cm-adj" style={compacto ? { padding: "8px 10px" } : undefined}>
      <IconoArchivo nombre={adjunto.file_name} size={compacto ? 14 : 16} />
      <div className="txt">
        <b>{adjunto.file_name}</b>
        <small>{fmtTam(adjunto.size_bytes)}</small>
      </div>
      <button className="cm-icbtn" title="Vista previa" onClick={() => onVer({
        url: urlAdjunto(adjunto.id), file_name: adjunto.file_name, mime_type: adjunto.mime_type,
        size_bytes: adjunto.size_bytes, autor, contexto: "Adjunto de Comunidad",
      })}><Eye size={14} /></button>
      <a className="cm-icbtn" title="Descargar" href={urlAdjunto(adjunto.id, true)} download={adjunto.file_name}><Download size={14} /></a>
    </div>
  );
}

/* ---------- Campo de comentario con menciones ---------- */
export function CampoComentario({ texto, setTexto, areaRef, miembros, archivos, setArchivos, enviando, onEnviar, placeholder = "Escribe un comentario..." }) {
  const [sugerencias, setSugerencias] = useState(null);
  const entrada = useRef(null);

  function alEscribir(valor) {
    setTexto(valor);
    // Autocompletado al escribir @ al final de la palabra actual.
    const m = valor.slice(0, areaRef.current?.selectionStart ?? valor.length).match(/@([\p{L}\p{N}._-]*)$/u);
    if (!m) return setSugerencias(null);
    const q = m[1].toLowerCase();
    const lista = miembros.filter((x) => x.full_name.toLowerCase().includes(q)).slice(0, 6);
    setSugerencias(lista.length ? lista : null);
  }

  function elegir(persona) {
    const pos = areaRef.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, pos).replace(/@([\p{L}\p{N}._-]*)$/u, "");
    const nombre = persona.full_name.replace(/\s+/g, "");
    const nuevo = `${antes}@${nombre} ${texto.slice(pos)}`;
    setTexto(nuevo);
    setSugerencias(null);
    setTimeout(() => areaRef.current?.focus(), 0);
  }

  return (
    <div style={{ position: "relative" }}>
      {sugerencias && (
        <div className="cm-mentions">
          {sugerencias.map((p) => (
            <button key={p.id} onClick={() => elegir(p)}>
              <Avatar persona={p} tam="xs" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 12.5 }}>{p.full_name}</b>
                <span style={{ fontSize: 10.5, color: "var(--cm-muted)" }}>{p.cargo || "Miembro"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {archivos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {archivos.map((f, i) => (
            <span key={i} className="cm-tag" style={{ cursor: "default" }}>
              <Paperclip size={11} />{f.name}
              <button className="cm-icbtn" style={{ width: 18, height: 18 }}
                onClick={() => setArchivos(archivos.filter((_, j) => j !== i))}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="cm-reply">
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea ref={areaRef} value={texto} placeholder={placeholder}
            onChange={(e) => alEscribir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onEnviar(); }
              if (e.key === "Escape") setSugerencias(null);
            }} />
          <div className="cm-reply-tools">
            <button className="cm-icbtn" title="Adjuntar archivo" onClick={() => entrada.current?.click()}><Paperclip size={15} /></button>
            <button className="cm-icbtn" title="Mencionar" onClick={() => { setTexto(texto + "@"); areaRef.current?.focus(); }}><AtSign size={15} /></button>
            <input ref={entrada} type="file" multiple hidden onChange={(e) => { setArchivos([...archivos, ...e.target.files]); e.target.value = ""; }} />
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--cm-muted)", fontWeight: 700 }}>Ctrl + Enter para enviar</span>
          </div>
        </div>
        <button className="cm-enviar" disabled={enviando || !texto.trim()} onClick={onEnviar} title="Enviar"><Send size={16} /></button>
      </div>
    </div>
  );
}

// Aplica un cambio a un comentario dentro del árbol de dos niveles.
function actualizarEnArbol(lista, id, fn) {
  return lista?.map((c) => {
    if (c.id === id) return fn(c);
    if (c.respuestas?.some((r) => r.id === id)) {
      return { ...c, respuestas: c.respuestas.map((r) => (r.id === id ? fn(r) : r)) };
    }
    return c;
  });
}
