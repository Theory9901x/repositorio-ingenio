"use client";

import { useEffect, useState } from "react";
import { Briefcase, FileText, Plus, ShieldCheck, Upload } from "lucide-react";

const SECTIONS = [
  ["cronograma", "Cronogramas"],
  ["plan_trabajo", "Planes de trabajo"],
  ["acta", "Actas"],
  ["formato", "Formatos asociados"],
  ["soporte", "Documentos soporte"],
  ["evidencia", "Evidencias"],
];

export default function ContractRoutesPanel({ user }) {
  const [contracts, setContracts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [files, setFiles] = useState([]);
  const [section, setSection] = useState("cronograma");
  const [form, setForm] = useState({ title: "", code: "", entity_name: "", description: "" });
  const [upload, setUpload] = useState({ title: "", visibility: "general", file: null });
  const isAdmin = user?.isAdmin === true;

  async function loadContracts() {
    const data = await fetch("/api/contracts", { cache: "no-store" }).then((r) => r.json());
    setContracts(Array.isArray(data) ? data : []);
  }

  async function loadFiles(contractId) {
    if (!contractId) return setFiles([]);
    const data = await fetch(`/api/contracts/${contractId}/files`, { cache: "no-store" }).then((r) => r.json());
    setFiles(Array.isArray(data) ? data : []);
  }

  useEffect(() => { loadContracts(); }, []);
  useEffect(() => { loadFiles(selected?.id); }, [selected?.id]);

  async function createContract() {
    if (!form.title.trim()) return alert("Escribe el nombre de la ruta o contrato");
    const r = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!r.ok) return alert((await r.json()).error || "No se pudo crear");
    setForm({ title: "", code: "", entity_name: "", description: "" });
    await loadContracts();
  }

  async function uploadFile() {
    if (!selected) return alert("Selecciona una ruta");
    if (!upload.file) return alert("Selecciona un archivo");
    const fd = new FormData();
    fd.append("title", upload.title || upload.file.name);
    fd.append("section", section);
    fd.append("visibility", upload.visibility);
    fd.append("file", upload.file);
    const r = await fetch(`/api/contracts/${selected.id}/files`, { method: "POST", body: fd });
    if (!r.ok) return alert((await r.json()).error || "No se pudo subir");
    setUpload({ title: "", visibility: upload.visibility, file: null });
    await loadFiles(selected.id);
  }

  const visibleFiles = files.filter((f) => f.section === section);
  const count = (id) => files.filter((f) => f.section === id).length;

  return (
    <section className="section dashboard-section contracts-module">
      <div className="contract-hero">
        <div>
          <div className="eyebrow"><Briefcase size={14} /> Contratos / Rutas de trabajo</div>
          <h2 className="h2">Gestión por contrato, cronogramas, actas y evidencias</h2>
          <p className="lead">El administrador crea la ruta. Todos los usuarios pueden consultar documentos y subir evidencias asociadas al contrato.</p>
        </div>
        {isAdmin && <span className="admin-pill"><ShieldCheck size={15} /> Creación solo admin</span>}
      </div>

      <div className="contract-layout">
        <aside className="contract-list">
          {isAdmin && (
            <div className="contract-create">
              <h3>Nueva ruta</h3>
              <input placeholder="Contrato Gobernación" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input placeholder="Código / No. contrato" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <input placeholder="Entidad contratante" value={form.entity_name} onChange={(e) => setForm({ ...form, entity_name: e.target.value })} />
              <textarea placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <button className="btn btn-primary" onClick={createContract}><Plus size={15} /> Crear ruta</button>
            </div>
          )}

          <div className="contract-list-head">Rutas activas</div>
          {contracts.map((c) => (
            <button key={c.id} className={"contract-card " + (selected?.id === c.id ? "on" : "")} onClick={() => setSelected(c)}>
              <span>{c.code || "SIN-CODIGO"}</span>
              <strong>{c.title}</strong>
              <em>{c.entity_name || "Sin entidad"}</em>
            </button>
          ))}
          {!contracts.length && <div className="tree-empty">No hay rutas creadas todavía.</div>}
        </aside>

        <main className="contract-detail">
          {!selected ? (
            <div className="empty-state"><h3>Selecciona una ruta de trabajo</h3><p>Centraliza cronogramas, planes, actas, formatos y evidencias por contrato.</p></div>
          ) : (
            <>
              <div className="contract-titlebar">
                <div>
                  <span className="code">{selected.code || "RUTA"}</span>
                  <h3>{selected.title}</h3>
                  <p>{selected.entity_name} · {selected.status}</p>
                </div>
                <div className="contract-metrics"><span><FileText size={15} /> {files.length} archivos</span></div>
              </div>

              <div className="contract-tabs">
                {SECTIONS.map(([id, label]) => <button key={id} className={section === id ? "on" : ""} onClick={() => setSection(id)}>{label} ({count(id)})</button>)}
              </div>

              <div className="contract-upload">
                <input placeholder="Título del archivo" value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} />
                <select value={upload.visibility} onChange={(e) => setUpload({ ...upload, visibility: e.target.value })}>
                  <option value="general">Documento general</option>
                  <option value="user_evidence">Evidencia de mi usuario</option>
                </select>
                <input type="file" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} />
                <button className="btn btn-primary" onClick={uploadFile}><Upload size={15} /> Subir</button>
              </div>

              <div className="contract-files-grid">
                {visibleFiles.map((f) => (
                  <div className="doc-card contract-file-card" key={f.id}>
                    <div className="doc-icon"><FileText size={20} /></div>
                    <span className="code">{f.section}</span>
                    <h4>{f.title}</h4>
                    <p>{f.uploaded_by_name || "Usuario"} · {f.created_at}</p>
                    <div className="doc-card-foot">
                      <span>{f.visibility === "user_evidence" ? "Evidencia usuario" : "General"}</span>
                      <a className="view-link" href={`/api/contracts/file/${f.id}/download`} target="_blank">Abrir</a>
                    </div>
                  </div>
                ))}
              </div>
              {!visibleFiles.length && <div className="empty-state"><h3>Sin archivos en esta sección</h3><p>Sube documentos para esta ruta de trabajo.</p></div>}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
