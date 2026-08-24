"use client";

import { useEffect, useState } from "react";
import MiEspacio from "../components/MiEspacio";

export default function WorkspacePage() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((me) => setUser(me && me.id ? me : null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="me-loading"><span className="me-spinner" /> Cargando tu espacio…</div>;
  if (!user) return <div className="me-loading">Debes iniciar sesión desde el repositorio.</div>;

  return <MiEspacio user={user} />;
}
