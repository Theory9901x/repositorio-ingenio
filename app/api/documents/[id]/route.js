import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

async function safeUnlink(stored) {
  if (!stored) return;
  try { await fs.unlink(path.join(UPLOAD_DIR, stored)); } catch {}
}

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const pool = getPool();
  const fd = await req.formData();

  const [[doc]] = await pool.query("SELECT * FROM documents WHERE id=?", [id]);
  if (!doc) return Response.json({ error: "No existe" }, { status: 404 });

  const name = (fd.get("name") || doc.name).toString().trim();
  const state = (fd.get("state") || doc.state).toString();
  const origin = (fd.get("origin") || doc.origin).toString();
  const isPublic = fd.get("isPublic") === "true" ? 1 : 0;
  const due = (fd.get("due") || "").toString() || null;
  const newVersion = fd.get("newVersion") === "true";

  let version = doc.version;
  if (newVersion) version = (parseFloat(doc.version) + 1).toFixed(1);

  const file = fd.get("file");
  if (file && typeof file === "object" && file.size > 0) {
    const ext = path.extname(file.name) || "";
    const stored = crypto.randomUUID() + ext;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
    await safeUnlink(doc.file_path); // borra el archivo anterior
    await pool.query(
      `UPDATE documents SET name=?, state=?, origin=?, is_public=?, due_date=?, version=?,
              file_name=?, file_mime=?, file_path=? WHERE id=?`,
      [name, state, origin, isPublic, due, version, file.name, file.type || "application/octet-stream", stored, id]
    );
  } else {
    await pool.query(
      `UPDATE documents SET name=?, state=?, origin=?, is_public=?, due_date=?, version=? WHERE id=?`,
      [name, state, origin, isPublic, due, version, id]
    );
  }

  return Response.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const [[doc]] = await pool.query("SELECT file_path FROM documents WHERE id=?", [Number(params.id)]);
  await pool.query("DELETE FROM documents WHERE id=?", [Number(params.id)]);
  if (doc) await safeUnlink(doc.file_path);
  return Response.json({ ok: true });
}
