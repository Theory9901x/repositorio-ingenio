"use client";

import { useRef, useState } from "react";
import { Bell, FileText, FolderOpen, Hash, Lightbulb, MessageSquare, Paperclip, X } from "lucide-react";
import { enviarForm, enviarJson } from "../gc/api";
import { fmtTam } from "../gc/ui";

const ICONO = { general: MessageSquare, pregunta: Lightbulb, conocimiento: FileText, proyecto: FolderOpen, anuncio: Bell };

export default function CrearPublicacion({ inicial, rol, categorias, onClose, onCreada, avisar }) {
  const [form, setForm] = useState({ type: inicial.type || "general", title: "", body: "", tags: "" });
  const [archivos, setArchivos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const entrada = useRef(null);

  const tipos = categorias.filter((c) => c.slug !== "todo" && !(c.slug === "anuncio" && rol === "TRABAJADOR"));

  async function publicar() {
    setGuardando(true);
    try {
      if (archivos.length) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.set(k, v));
        for (const f of archivos) fd.append("files", f);
        await enviarForm("/api/cm/posts", "POST", fd);
      } else {
        await enviarJson("/api/cm/posts", "POST", form);
      }
      onCreada();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  const ayuda = {
    general: "Una conversación abierta con el equipo.",
    pregunta: "Recibirás respuestas y podrás marcar la que resolvió tu duda.",
    conocimiento: "Procedimientos, guías y aprendizajes que otros podrán guardar.",
    proyecto: "Conversación asociada a un proyecto en curso.",
    anuncio: "Información institucional. Puede fijarse en la parte superior.",
  }[form.type];

  return (
    <>
      <div className="cm-overlay" onClick={onClose} />
      <aside className="cm-drawer" role="dialog" aria-label="Crear publicación">
        <header className="cm-drawer-head">
          <div style={{ flex: 1 }}>
            <h3>Crear publicación</h3>
            <p>Comparte una conversación, una duda o conocimiento con tu equipo.</p>
          </div>
          <button className="cm-icbtn" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </header>

        <div className="cm-drawer-body">
          <div className="cm-field">
            <label>Tipo de publicación</label>
            <div className="cm-tipos">
              {tipos.map((c) => {
                const I = ICONO[c.slug] || MessageSquare;
                return (
                  <button key={c.slug} className={form.type === c.slug ? "on" : ""} onClick={() => setForm({ ...form, type: c.slug })}>
                    <I size={14} /> {c.nombre}
                  </button>
                );
              })}
            </div>
            <span className="hint">{ayuda}</span>
          </div>

          <div className="cm-field">
            <label>Título *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus
              placeholder={form.type === "pregunta" ? "¿Cómo gestionar la revisión de un contrato?" : "Nueva plantilla de acta de reunión aprobada"} />
          </div>

          <div className="cm-field">
            <label>Contenido *</label>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Desarrolla tu publicación. Puedes mencionar a alguien escribiendo @ seguido de su nombre." />
            <span className="hint">Escribe @Nombre para mencionar a un compañero; recibirá una notificación.</span>
          </div>

          <div className="cm-field">
            <label>Etiquetas</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="contratos procedimientos plantillas" />
            <span className="hint">Separadas por espacios o comas. Máximo 6.</span>
            {form.tags.trim() && (
              <div className="cm-tags" style={{ marginTop: 6 }}>
                {form.tags.split(/[,\s]+/).filter(Boolean).slice(0, 6).map((t, i) => (
                  <span className="cm-tag" key={i} style={{ cursor: "default" }}><Hash size={11} />{t.replace(/^#/, "")}</span>
                ))}
              </div>
            )}
          </div>

          <div className="cm-field">
            <label>Adjuntos</label>
            <button className="cm-btn ghost" style={{ justifyContent: "center" }} onClick={() => entrada.current?.click()}>
              <Paperclip size={15} /> Seleccionar archivos
            </button>
            <input ref={entrada} type="file" multiple hidden onChange={(e) => { setArchivos([...archivos, ...e.target.files]); e.target.value = ""; }} />
            {archivos.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {archivos.map((f, i) => (
                  <div className="cm-adj" key={i} style={{ padding: "9px 11px" }}>
                    <div className="txt"><b>{f.name}</b><small>{fmtTam(f.size)}</small></div>
                    <button className="cm-icbtn" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="cm-drawer-foot">
          <button className="cm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="cm-btn primary" disabled={guardando || !form.title.trim() || !form.body.trim()} onClick={publicar}>
            {guardando ? "Publicando…" : "Publicar"}
          </button>
        </footer>
      </aside>
    </>
  );
}
