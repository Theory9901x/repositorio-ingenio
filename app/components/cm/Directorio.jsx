"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Search, Users, X } from "lucide-react";
import { api } from "../gc/api";
import { Avatar } from "./Comunidad";

export default function Directorio({ onClose, avisar }) {
  const [personas, setPersonas] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => {
      api(`/api/cm/directory${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then(setPersonas)
        .catch((e) => { avisar(e.message, "error"); setPersonas([]); });
    }, 280);
    return () => clearTimeout(id);
  }, [q, avisar]);

  return (
    <>
      <div className="cm-overlay" onClick={onClose} />
      <aside className="cm-drawer" style={{ width: "min(520px,100vw)" }} role="dialog" aria-label="Directorio del equipo">
        <header className="cm-drawer-head">
          <div style={{ flex: 1 }}>
            <h3>Directorio del equipo</h3>
            <p>Las personas que participan en la plataforma.</p>
          </div>
          <button className="cm-icbtn" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </header>

        <div className="cm-drawer-body">
          <div className="cm-search" style={{ maxWidth: "none" }}>
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona…" autoFocus />
          </div>

          {personas === null ? (
            <div style={{ display: "grid", gap: 8 }}>{[1, 2, 3, 4].map((i) => <div className="cm-skel" style={{ height: 62 }} key={i} />)}</div>
          ) : personas.length ? (
            <div className="cm-dir">
              {personas.map((p) => (
                <div className="cm-dir-item" key={p.id}>
                  <Avatar persona={p} />
                  <div className="txt">
                    <b>{p.full_name}</b>
                    <small>{p.cargo || "Sin cargo"}{p.email ? ` · ${p.email}` : ""}</small>
                    <small style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 3, color: "var(--cm-violet)" }}>
                      <span>{p.publicaciones} publicaciones</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageCircle size={11} />{p.comentarios}</span>
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cm-empty">
              <div className="ico"><Users size={20} /></div>
              <h3>Sin resultados</h3>
              <p>Ninguna persona coincide con «{q}».</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
