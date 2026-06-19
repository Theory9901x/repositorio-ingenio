"use client";

import { useEffect, useState } from "react";

export default function DashboardApp(){
  const [msg,setMsg]=useState("Cargando plataforma...");
  useEffect(()=>{setMsg("Dashboard en mantenimiento")},[]);
  return <div className="loading">{msg}</div>;
}
