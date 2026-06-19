"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Search } from "lucide-react";

const TIER_LABELS = { estrategico: "Estratégico", misional: "Misional", apoyo: "Apoyo", evaluacion: "Evaluación" };
const STATES = { vigente: "Vigente", no_publicado: "No publicado", obsoleto: "Obsoleto", anulado: "Anulado" };

export default function ProcessDetailView({ process, docs = [], docTypes = [], onBack = () => {}, onOpenDoc = () => {} }) {
  const [tab, setTab] = useState("general");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({});
  const processDocs = useMemo(() => docs.filter((doc) => Number(doc.processId) === Number(process?.id)), [docs, process?.id]);
  const visibleDocs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return processDocs;
    return processDocs.filter((doc) => [doc.code, doc.name, doc.file].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [processDocs, query]);
  const grouped = docTypes.map((type) => ({ type, items: visibleDocs.filter((doc) => Number(doc.typeId) === Number(type.id)) })).filter((group) => group.items.length);

  if (!process) return null;
  return <section className="section dashboard-section process-detail-view">
    <div className="crumb premium-crumb"><button onClick={onBack}><ArrowLeft size={15} /> Volver a procesos</button><ChevronRight size={14} /><span>{process.name}</span></div>
    <div className="process-sheet-hero"><div className="process-logo-box"><FolderOpen size={30} /></div><div className="process-sheet-main"><div className="eyebrow">Caracterización del proceso</div><h2>{process.name}</h2><p>Ficha institucional y documentación controlada del proceso.</p></div><div className="process-code-box"><b>Código / sigla</b><span>{process.sigla || "—"}</span><b>Clasificación</b><span>{TIER_LABELS[process.tier] || process.tier}</span></div></div>
    <div className="process-tabs" role="tablist"><button className={tab === "general" ? "on" : ""} onClick={() => setTab("general")}>General</button><button className={tab === "caracterizacion" ? "on" : ""} onClick={() => setTab("caracterizacion")}>Caracterización</button><button className={tab === "documentacion" ? "on" : ""} onClick={() => setTab("documentacion")}>Documentación ({processDocs.length})</button></div>
    {tab === "general" && <GeneralProcess process={process} docs={processDocs} />}
    {tab === "caracterizacion" && <Characterization process={process} />}
    {tab === "documentacion" && <div className="process-docs-panel"><div className="searchbar wide"><Search size={16} /><input placeholder="Buscar dentro de este proceso…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="doc-tree"><div className="tree-title"><FolderOpen size={18} /> Documentación del proceso</div>{grouped.map((group) => { const isOpen = open[group.type.id] !== false; return <div className="doc-folder" key={group.type.id}><button className="folder-line" onClick={() => setOpen({ ...open, [group.type.id]: !isOpen })}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Folder size={17} /><strong>{group.type.name}</strong><span>{group.items.length}</span></button>{isOpen && <div className="folder-docs">{group.items.map((doc) => <button className="tree-doc" key={doc.id} onClick={() => onOpenDoc(doc)}><FileText size={17} /><span className="code">{doc.code}</span><strong>{doc.name}</strong><em>V {doc.version || "—"}</em><small className={`badge st-${doc.state}`}>{STATES[doc.state] || doc.state}</small></button>)}</div>}</div>; })}{!grouped.length && <div className="empty-state"><h3>Sin documentos</h3><p>No hay documentos asociados o no coinciden con la búsqueda.</p></div>}</div></div>}
  </section>;
}

function GeneralProcess({ process, docs }) {
  return <><div className="process-badges"><div className="process-badge"><b>{process.sigla}</b><span>Código</span></div><div className="process-badge"><b>{TIER_LABELS[process.tier] || process.tier}</b><span>Clasificación</span></div><div className="process-badge"><b>{docs.length}</b><span>Documentos</span></div><div className="process-badge"><b>{docs.filter((doc) => doc.state === "vigente").length}</b><span>Vigentes</span></div></div><Characterization process={process} /></>;
}

function Characterization({ process }) {
  return <div className="process-characterization"><article className="process-info-card"><h3>Objetivo</h3><p>{process.objective || `Gestionar de forma controlada las actividades y la información asociadas a ${process.name}.`}</p></article><article className="process-info-card"><h3>Dueño del proceso</h3><p>{process.owner || `Líder responsable designado para ${process.name}.`}</p></article><article className="process-info-card"><h3>Alcance</h3><p>{process.scope || "Comprende la planeación, ejecución, seguimiento y mejora, junto con la creación, consulta y actualización de su documentación."}</p></article><article className="process-info-card"><h3>Subprocesos</h3><div className="subprocess-list">{(process.subprocesses || ["Planeación", "Ejecución", "Seguimiento", "Documentación", "Indicadores", "Mejora continua"]).map((item) => <span key={item}>{item}</span>)}</div></article></div>;
}
