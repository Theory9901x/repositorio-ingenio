import mysql from "mysql2/promise";

let pool;

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable DATABASE_URL");
    const u = new URL(url);
    pool = mysql.createPool({
      host: u.hostname,
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
      waitForConnections: true,
      connectionLimit: 5,
      charset: "utf8mb4",
    });
  }
  return pool;
}
