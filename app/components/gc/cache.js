"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

// Caché en memoria con revalidación en segundo plano.
// Cada petición al servidor cuesta ~100 ms de red, así que volver a una
// pestaña ya visitada debe pintar de inmediato desde la caché y refrescarse
// después sin bloquear la interfaz.

const memoria = new Map(); // url -> { datos, ts }
const enVuelo = new Map(); // url -> Promise (evita peticiones duplicadas)

const VIGENCIA = 30_000; // pasado este tiempo se revalida al volver

export function invalidar(prefijo) {
  if (!prefijo) return memoria.clear();
  for (const clave of [...memoria.keys()]) {
    if (clave.startsWith(prefijo)) memoria.delete(clave);
  }
}

export function enCache(url) {
  return memoria.has(url) ? memoria.get(url).datos : null;
}

// Guarda datos que ya tenemos bajo otra URL equivalente, para no volver a
// pedir al servidor algo que acaba de responder.
export function sembrar(url, datos) {
  if (url && datos !== undefined) memoria.set(url, { datos, ts: Date.now() });
}

// Pide una URL reutilizando la petición si ya está en curso.
export function pedir(url, { refrescar = false } = {}) {
  if (!refrescar) {
    const guardado = memoria.get(url);
    if (guardado && Date.now() - guardado.ts < VIGENCIA) return Promise.resolve(guardado.datos);
  }
  if (enVuelo.has(url)) return enVuelo.get(url);

  const promesa = api(url)
    .then((datos) => { memoria.set(url, { datos, ts: Date.now() }); return datos; })
    .finally(() => enVuelo.delete(url));
  enVuelo.set(url, promesa);
  return promesa;
}

// Adelanta una petición sin esperar el resultado (por ejemplo al pasar el ratón).
export function precargar(url) {
  if (!url || memoria.has(url) || enVuelo.has(url)) return;
  pedir(url).catch(() => {});
}

/**
 * Devuelve los datos de una URL pintando al instante lo que haya en caché.
 * `cargando` solo es cierto la primera vez, cuando no hay nada que mostrar.
 */
export function useDatos(url, { activo = true, onError } = {}) {
  const [datos, setDatos] = useState(() => (url && activo ? enCache(url) : null));
  const [cargando, setCargando] = useState(() => !(url && activo && enCache(url)));
  const vigente = useRef(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const cargar = useCallback(async (refrescar = false) => {
    if (!url || !activo) return;
    const turno = ++vigente.current;
    const previo = enCache(url);
    setDatos(previo);
    setCargando(!previo);
    try {
      const nuevo = await pedir(url, { refrescar });
      if (turno === vigente.current) { setDatos(nuevo); setCargando(false); }
    } catch (e) {
      if (turno === vigente.current) {
        setCargando(false);
        errorRef.current?.(e);
      }
    }
  }, [url, activo]);

  useEffect(() => { cargar(); }, [cargar]);

  // `refrescar` fuerza ir al servidor; se usa tras crear o modificar algo.
  const refrescar = useCallback(() => cargar(true), [cargar]);

  return { datos, cargando, refrescar, setDatos };
}
