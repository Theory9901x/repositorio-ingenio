"use client";
import { Download, FileSpreadsheet, FileText, X } from "lucide-react";

export default function EmbeddedFileViewer({ item, onClose }) {
  if (!item) return null;
  const mime = item.mime || item.mime_type || "";
  const name = item.fileName || item.file_name || item.title || "Archivo";
  const url = item.url;
  const downloadUrl = item.downloadUrl || item.url;
  const kind =
    mime.includes("pdf") || /\.pdf$/i.test(name) ? "pdf"
    : mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? "image"
    : "other";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="embedded-viewer" onClick={(e) => e.stopPropagation()}>
        <aside>
          <button className="viewer-close" onClick={onClose}><X size={18} /></button>
          <div className="viewer-file-icon"><FileText size={28} /></div>
          <span className="eyebrow mini">Vista documental</span>
          <h2>{item.title || name}</h2>
          {[
            ["Archivo", name],
            ["Origen", item.sourceLabel || "Sistema"],
            ["Tipo", mime || "No identificado"],
            ["Tamaño", item.size ? `${(item.size / 1024).toFixed(1)} KB` : "—"],
            ["Fecha", item.date || "—"],
            ["Ubicación", item.location || "—"],
          ].map(([a, b]) => (
            <div className="viewer-data" key={a}><span>{a}</span><b>{b}</b></div>
          ))}
          <a href={downloadUrl} download={name} className="btn btn-primary"><Download size={15} /> Descargar</a>
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost">Abrir en pestaña nueva</a>
        </aside>
        <main>
          {kind === "image" ? (
            <img src={url} alt={name} />
          ) : kind === "pdf" ? (
            <iframe src={url} title={name} />
          ) : (
            <div className="no-preview">
              <FileSpreadsheet size={50} />
              <h3>Vista previa no disponible</h3>
              <p>Los archivos de Office y otros formatos se abren o descargan con el botón lateral.</p>
              <a href={downloadUrl} download={name} className="btn btn-primary"><Download size={15} /> Descargar</a>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
