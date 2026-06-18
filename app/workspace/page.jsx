"use client";

import { useEffect, useState } from "react";
import WorkspacePanel from "../components/WorkspacePanel";
import { ArrowLeft, LogOut, User } from "lucide-react";

export default function WorkspacePage() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [processes, setProcesses] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [detail, setDetail] = useState(null);

  const norm = (d) => ({ ...d, processId: d.process_id, typeId: d.type_id, isPublic: !!d.is_public, file: d.file_name || "", hasFile: !!d.has_file });

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      setUser(me || null);
      if (me) {
        const [p, t, d] = await Promise.all([
          fetch("/api/processes").then((r) => r.json()),
          fetch("/api/doctypes").then((r) => r.json()),
          fetch("/api/documents", { cache: "no-store" }).then((r) => r.json()),
        ]);
        setProcesses(p); setDocTypes(t); setDocs(d.map(norm));
      }
      setLoaded(true);
    })();
  }, []);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; }
  const procById = (id) => processes.find((p) => p.id === id);
  const typeById = (id) => docTypes.find((t) => t.id === id);

  if (!loaded) return <div className="loading">Cargando mi espacio…</div>;
  if (!user) return <div className="loading">Debes iniciar sesión desde el repositorio.</div>;

  return (
    <div className="workspace-page">
      <header className="workspace-top">
        <a href="/"><ArrowLeft size={16} /> Volver al repositorio</a>
        <div className="workspace-brand"><img src="/branding/logo-grupo-ingenio.png" alt="Grupo Ingenio" /><span>Mi espacio de trabajo</span></div>
        <div className="workspace-user"><button onClick={() => location.href = "/"}><User size={15} /> {user.full_name}</button><button onClick={logout}><LogOut size={15} /> Salir</button></div>
      </header>
      <main className="workspace-main">
        <WorkspacePanel docs={docs} procById={procById} typeById={typeById} setDetail={setDetail} />
      </main>
      {detail && (
        <div className="workspace-overlay" onClick={() => setDetail(null)}>
          <div className="workspace-modal" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDetail(null)}>Cerrar</button>
            <h3>{detail.name}</h3>
            <p>{detail.code}</p>
            {detail.hasFile && <a href={`/api/documents/${detail.id}/file`}>Descargar documento</a>}
          </div>
        </div>
      )}
      <style jsx global>{`
        .workspace-page{min-height:100vh;background:linear-gradient(135deg,#f7fbff,#edf4ff);color:#111827;font-family:'Hanken Grotesk',sans-serif}.workspace-top{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;border-bottom:1px solid #d7e1f6;background:rgba(255,255,255,.86);backdrop-filter:blur(10px)}.workspace-top a,.workspace-user button{border:1px solid #d7e1f6;background:white;border-radius:999px;padding:9px 13px;text-decoration:none;color:#101a63;font-weight:800;display:flex;align-items:center;gap:7px}.workspace-brand{display:flex;align-items:center;gap:12px;font-family:'Bricolage Grotesque';font-size:20px;font-weight:800}.workspace-brand img{height:42px;background:white;border-radius:12px;padding:5px}.workspace-user{display:flex;gap:8px}.workspace-main{max-width:1240px;margin:0 auto;padding:28px 22px}.workspace-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;border:1px solid #d7e1f6;border-radius:28px;background:linear-gradient(135deg,#fff,#e8f0ff);padding:26px;margin-bottom:18px;box-shadow:0 24px 70px -42px rgba(0,23,232,.42)}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0017e8;font-weight:900;display:flex;gap:7px;align-items:center}.h2{font-family:'Bricolage Grotesque';font-size:34px;line-height:1;margin:6px 0;color:#111827}.lead{color:#4b587c;line-height:1.5}.btn{border:0;border-radius:12px;padding:10px 15px;font-weight:900;display:inline-flex;gap:7px;align-items:center;cursor:pointer}.btn-primary{background:linear-gradient(135deg,#0017e8,#22d7df);color:white}.btn-ghost{background:white;color:#101a63;border:1px solid #d7e1f6}.workspace-layout{display:grid;grid-template-columns:320px 1fr;gap:18px}.workspace-tree,.workspace-content,.workspace-suggestions{background:white;border:1px solid #d7e1f6;border-radius:24px;padding:16px}.workspace-tabs{display:grid;gap:8px;margin-bottom:14px}.workspace-tabs button{border:1px solid #d7e1f6;background:#f3f7ff;color:#4b587c;border-radius:14px;padding:10px 12px;font-weight:900;display:flex;align-items:center;gap:8px;text-align:left}.workspace-tabs button.on{background:linear-gradient(135deg,#0017e8,#22d7df);color:white}.tree-root,.tree-row{display:flex;align-items:center;gap:8px;border-radius:12px;padding:9px 10px;font-size:13px}.tree-root{font-weight:900;color:#0017e8;background:#f3f7ff}.tree-row.on{background:rgba(0,23,232,.08)}.tree-row span{display:flex;align-items:center;gap:7px;flex:1;cursor:pointer}.tree-row button{border:0;background:transparent;color:#4b587c;display:flex}.tree-empty{padding:18px;color:#7b87a8}.workspace-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}.workspace-head h3{font-family:'Bricolage Grotesque';font-size:24px;margin:0}.upload-panel{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;border:1px solid #d7e1f6;background:#f3f7ff;border-radius:18px;padding:12px;margin-bottom:12px}.upload-panel.compact{grid-template-columns:1fr auto}.field label{display:block;font-size:12px;font-weight:900;color:#4b587c;margin-bottom:6px}.field input,.sel{width:100%;border:1px solid #d7e1f6;background:white;border-radius:12px;padding:11px 12px}.doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.doc-card{background:white;border:1px solid #d7e1f6;border-radius:20px;padding:16px;text-align:left;color:#111827}.doc-card:hover{border-color:#0017e8;box-shadow:0 20px 50px -36px rgba(0,23,232,.5)}.doc-icon{width:42px;height:42px;border-radius:14px;background:rgba(0,23,232,.08);display:flex;align-items:center;justify-content:center;color:#0017e8;margin-bottom:12px}.code{font-family:'JetBrains Mono';font-weight:900;font-size:12px;color:#101a63}.doc-card h4{font-family:'Bricolage Grotesque';font-size:17px;margin:8px 0}.doc-card p{color:#4b587c;font-size:13px}.doc-card-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #d7e1f6;padding-top:10px}.view-link{color:#0017e8;font-weight:900;display:flex;gap:5px;align-items:center;text-decoration:none}.iconbtn{border:1px solid #d7e1f6;background:white;width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center}.iconbtn.danger:hover{background:#c43a3a;color:white}.empty-state{border:1px dashed #b7c8ef;background:#fff;border-radius:22px;padding:34px;text-align:center;color:#7b87a8}.workspace-suggestions{margin-top:18px}.mini-doc{display:flex;flex-direction:column;gap:8px}.workspace-overlay{position:fixed;inset:0;background:rgba(7,19,94,.45);display:flex;align-items:center;justify-content:center}.workspace-modal{background:white;border-radius:20px;padding:24px;min-width:320px}@media(max-width:900px){.workspace-layout,.upload-panel,.upload-panel.compact{grid-template-columns:1fr}.workspace-top{align-items:flex-start;flex-direction:column}.workspace-user{flex-wrap:wrap}.workspace-hero{flex-direction:column;align-items:flex-start}}
      `}</style>
    </div>
  );
}
