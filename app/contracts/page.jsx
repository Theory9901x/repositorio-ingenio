"use client";

import { useEffect, useState } from "react";
import ContractRoutesPanel from "../components/ContractRoutesPanel";
import { ArrowLeft, LogOut } from "lucide-react";

export default function ContractsPage() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setUser(me || null);
      setLoaded(true);
    })();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }

  if (!loaded) return <div className="loading">Cargando rutas de trabajo…</div>;
  if (!user) return <div className="loading">Debes iniciar sesión desde el repositorio.</div>;

  return (
    <div className="contracts-page">
      <header className="contracts-top">
        <a href="/"><ArrowLeft size={16} /> Volver al dashboard</a>
        <strong>Contratos / Rutas de trabajo</strong>
        <button onClick={logout}><LogOut size={15} /> Salir</button>
      </header>
      <main className="contracts-main">
        <ContractRoutesPanel user={user} />
      </main>
    </div>
  );
}
