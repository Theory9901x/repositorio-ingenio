"use client";

// Preparación de archivos antes de subirlos, pensada para el celular: una
// foto de cámara pesa 4–8 MB y con datos móviles tarda una eternidad. Las
// imágenes se redimensionan y recomprimen en el dispositivo antes de viajar;
// cualquier otro archivo pasa intacto.

const LADO_MAXIMO = 1800;      // suficiente para leer un acta fotografiada
const CALIDAD = 0.82;
const UMBRAL = 500 * 1024;     // por debajo de 500 KB no vale la pena tocarla

const esImagen = (file) => /^image\/(jpeg|png|webp)$/i.test(file?.type || "");

export async function prepararArchivo(file) {
  if (!file || !esImagen(file) || file.size <= UMBRAL) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext("2d").drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise((res) => lienzo.toBlob(res, "image/jpeg", CALIDAD));
    // Solo se usa la versión comprimida si de verdad quedó más liviana.
    if (!blob || blob.size >= file.size) return file;

    const nombre = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    // Un formato que el navegador no decodifica (HEIC viejo, etc.): va tal cual.
    return file;
  }
}
