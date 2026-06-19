"use client";

import { useEffect, useState } from "react";

export default function DashboardApp(){
  const [msg,setMsg]=useState("Cargando plataforma...");
  useEffect(()=>{setMsg("Dashboard cargado")},[]);
  return <div className="loading">{msg}</div>;
}
