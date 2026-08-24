"use client";

// Cliente único del módulo. Centraliza el manejo de errores para que todas las
// vistas muestren el motivo real que devuelve el backend.
export async function api(url, opciones = {}) {
  const res = await fetch(url, { cache: "no-store", ...opciones });
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new Error(datos?.error || `No fue posible completar la acción (error ${res.status})`);
  return datos;
}

export const enviarJson = (url, metodo, cuerpo) =>
  api(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

export const enviarForm = (url, metodo, formData) => api(url, { method: metodo, body: formData });

// URL del servidor único de archivos.
export const urlArchivo = (tipo, id) => `/api/gc/file?tipo=${tipo}&id=${id}`;
