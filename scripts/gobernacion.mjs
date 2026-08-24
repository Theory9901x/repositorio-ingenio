// Alta de los participantes del contrato de la Gobernación.
//
//   node scripts/gobernacion.mjs            → solo informa, no escribe nada
//   node scripts/gobernacion.mjs aplicar    → crea, inscribe y muestra las claves
//
// Es idempotente: a quien ya existe no se le toca la contraseña salvo que se
// pida con `aplicar reset`.
import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const APLICAR = process.argv.includes("aplicar");
const RESET = process.argv.includes("reset");

const PERSONAS = [
  { full_name: "Carlos Alberto Robayo", username: "carlos.robayo", cargo: "CEO", role: "admin", rol_contrato: "supervisor" },
  { full_name: "Natalia Forero Bejarano", username: "natalia.forero", cargo: "Profesional de apoyo", role: "usuario", rol_contrato: "apoyo" },
  { full_name: "Laura Vannesa Vega", username: "laura.vega", cargo: "Profesional de apoyo", role: "usuario", rol_contrato: "apoyo" },
];

function claveTemporal() {
  return `Ingenio.${crypto.randomBytes(4).toString("base64url").replace(/[-_]/g, "")}`;
}

const env = fs.readFileSync(".env", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const u = new URL(url);
const db = await mysql.createConnection({
  host: u.hostname, port: u.port || 3306,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), charset: "utf8mb4",
});

// --- Situación actual -------------------------------------------------------
const [contratos] = await db.query(
  "SELECT id, code, title, entity_name, internal_responsible_id FROM contract_routes ORDER BY id"
);
console.log("\nCONTRATOS");
for (const c of contratos) console.log(` #${c.id}  ${c.code || "-"}  ${c.title || ""}  · entidad: ${c.entity_name || "-"}`);

const [usuarios] = await db.query(
  "SELECT id, full_name, username, email, role, is_active FROM users ORDER BY id"
);
console.log("\nUSUARIOS");
for (const x of usuarios) console.log(` #${x.id}  ${x.full_name}  (${x.username || x.email || "sin usuario"})  ${x.role}${x.is_active ? "" : "  [inactivo]"}`);

const terra = (t) => /terra/i.test(String(t || ""));
console.log("\nCOINCIDENCIAS CON «TERRA»");
console.log(" usuarios:", usuarios.filter((x) => terra(x.full_name) || terra(x.username) || terra(x.email)).map((x) => `#${x.id} ${x.full_name}`).join(", ") || "ninguna");
console.log(" contratos:", contratos.filter((c) => terra(c.entity_name) || terra(c.title)).map((c) => `#${c.id} ${c.entity_name || c.title}`).join(", ") || "ninguna");
const [empresas] = await db.query("SELECT id, name FROM contract_companies");
console.log(" empresas:", empresas.filter((e) => terra(e.name)).map((e) => `#${e.id} ${e.name}`).join(", ") || "ninguna");

// El contrato de la Gobernación se localiza por entidad o título.
const gob = contratos.find((c) => /gobernaci/i.test(`${c.entity_name || ""} ${c.title || ""}`));
console.log("\nCONTRATO DE LA GOBERNACIÓN:", gob ? `#${gob.id} · ${gob.title || gob.code}` : "NO ENCONTRADO");

if (!APLICAR) {
  console.log("\n(solo informe: vuelve a ejecutar con `aplicar` para crear e inscribir)");
  await db.end();
  process.exit(0);
}
if (!gob) { console.log("\nSin contrato de la Gobernación no se inscribe a nadie."); await db.end(); process.exit(1); }

// --- Alta e inscripción -----------------------------------------------------
const credenciales = [];
for (const p of PERSONAS) {
  const [[ya]] = await db.query("SELECT id FROM users WHERE LOWER(username)=?", [p.username]);
  let id = ya?.id;
  if (!id) {
    const clave = claveTemporal();
    const [r] = await db.query(
      "INSERT INTO users (full_name, username, cargo, role, password_hash, is_active) VALUES (?,?,?,?,?,1)",
      [p.full_name, p.username, p.cargo, p.role, await bcrypt.hash(clave, 12)]
    );
    id = r.insertId;
    credenciales.push({ ...p, id, clave, nota: "creado" });
  } else if (RESET) {
    const clave = claveTemporal();
    await db.query("UPDATE users SET password_hash=?, is_active=1 WHERE id=?", [await bcrypt.hash(clave, 12), id]);
    credenciales.push({ ...p, id, clave, nota: "contraseña restablecida" });
  } else {
    credenciales.push({ ...p, id, clave: "(ya existía, sin cambios)", nota: "ya existía" });
  }
  await db.query(
    `INSERT INTO contract_users (contract_id, user_id, role_in_contract, assigned_by) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE role_in_contract=VALUES(role_in_contract)`,
    [gob.id, id, p.rol_contrato, id]
  );
  await db.query("INSERT IGNORE INTO contract_members (contract_id, user_id) VALUES (?,?)", [gob.id, id]);
}

// El superadministrador queda también inscrito y como responsable interno.
const [[jefe]] = await db.query("SELECT id FROM users WHERE role='admin' AND is_active=1 ORDER BY id LIMIT 1");
if (jefe) {
  await db.query(
    `INSERT INTO contract_users (contract_id, user_id, role_in_contract, assigned_by) VALUES (?,?, 'supervisor', ?)
     ON DUPLICATE KEY UPDATE role_in_contract='supervisor'`,
    [gob.id, jefe.id, jefe.id]
  );
  await db.query("INSERT IGNORE INTO contract_members (contract_id, user_id) VALUES (?,?)", [gob.id, jefe.id]);
  if (!gob.internal_responsible_id) {
    await db.query("UPDATE contract_routes SET internal_responsible_id=? WHERE id=?", [jefe.id, gob.id]);
  }
}

// Terra sale del sistema: la cuenta se desactiva (no se borra, para no dejar
// huérfanos sus registros históricos) y deja de poder entrar y de aparecer.
const [fuera] = await db.query(
  "UPDATE users SET is_active=0 WHERE username='terra.vega' OR LOWER(full_name) LIKE '%terra%'"
);
if (fuera.affectedRows) {
  await db.query("DELETE cu FROM contract_users cu JOIN users u ON u.id=cu.user_id WHERE u.is_active=0");
  await db.query("DELETE cm FROM contract_members cm JOIN users u ON u.id=cm.user_id WHERE u.is_active=0");
  console.log("Terra desactivada y retirada de los contratos.");
}

console.log("\nCREDENCIALES (se muestran una sola vez)");
for (const c of credenciales) console.log(` ${c.full_name.padEnd(26)} usuario: ${c.username.padEnd(18)} clave: ${c.clave}   [${c.nota}]`);
console.log("\nInscritos en el contrato #" + gob.id);

await db.end();
