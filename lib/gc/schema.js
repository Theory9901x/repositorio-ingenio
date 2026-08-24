import { getPool } from "@/lib/db";

// Esquema del módulo de Gestión Contractual.
// Se apoya en las tablas contract_* que ya existían y añade las que faltaban.
// Es idempotente: se puede invocar en cada request sin efectos secundarios.

let listo = false;

async function columnas(pool, tabla) {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [tabla]
  );
  return new Set(rows.map((r) => r.COLUMN_NAME));
}

async function agregarColumnas(pool, tabla, defs) {
  const existentes = await columnas(pool, tabla);
  for (const [nombre, tipo] of defs) {
    if (!existentes.has(nombre)) await pool.query(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${tipo}`);
  }
}

export async function ensureGcSchema() {
  const pool = getPool();
  if (listo) return pool;

  // --- Empresas -----------------------------------------------------------
  await pool.query(`CREATE TABLE IF NOT EXISTS contract_companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    nit VARCHAR(60) NULL,
    entity_type VARCHAR(60) NULL,
    logo_path VARCHAR(255) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'activa',
    internal_responsible_id INT NULL,
    next_review_date DATE NULL,
    notes TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_company_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // --- Periodos de actividades -------------------------------------------
  await pool.query(`CREATE TABLE IF NOT EXISTS contract_activity_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL,
    user_id INT NOT NULL,
    year SMALLINT NOT NULL,
    month TINYINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'abierto',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_periodo (contract_id, user_id, year, month),
    INDEX idx_periodo_contrato (contract_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // --- Informe mensual ----------------------------------------------------
  await pool.query(`CREATE TABLE IF NOT EXISTS contract_monthly_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL,
    user_id INT NOT NULL,
    year SMALLINT NOT NULL,
    month TINYINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'borrador',
    version INT NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NULL,
    file_path VARCHAR(255) NULL,
    mime_type VARCHAR(160) NULL,
    size_bytes BIGINT NULL,
    summary MEDIUMTEXT NULL,
    observations TEXT NULL,
    submitted_at DATETIME NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_informe (contract_id, user_id, year, month),
    INDEX idx_informe_contrato (contract_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // --- Evidencias ---------------------------------------------------------
  await pool.query(`CREATE TABLE IF NOT EXISTS contract_evidence_requirements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL,
    name VARCHAR(220) NOT NULL,
    category VARCHAR(80) NULL,
    description TEXT NULL,
    required TINYINT(1) NOT NULL DEFAULT 1,
    frequency VARCHAR(30) NOT NULL DEFAULT 'unica',
    due_date DATE NULL,
    applies_to VARCHAR(20) NOT NULL DEFAULT 'todos',
    assigned_user_id INT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_req_contrato (contract_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS contract_evidences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requirement_id INT NOT NULL,
    contract_id INT NOT NULL,
    user_id INT NOT NULL,
    period VARCHAR(7) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'cargada',
    file_name VARCHAR(255) NULL,
    file_path VARCHAR(255) NULL,
    mime_type VARCHAR(160) NULL,
    size_bytes BIGINT NULL,
    observations TEXT NULL,
    uploaded_by INT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated_by INT NULL,
    validated_at DATETIME NULL,
    INDEX idx_ev_contrato (contract_id),
    INDEX idx_ev_req (requirement_id),
    INDEX idx_ev_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // --- Carpetas de documentos del contrato --------------------------------
  await pool.query(`CREATE TABLE IF NOT EXISTS contract_document_folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL,
    parent_id INT NULL,
    name VARCHAR(180) NOT NULL,
    description VARCHAR(400) NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_carpeta_contrato (contract_id),
    INDEX idx_carpeta_padre (parent_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // --- Columnas nuevas sobre tablas existentes ----------------------------
  await agregarColumnas(pool, "contract_files", [["folder_id", "INT NULL"]]);
  await agregarColumnas(pool, "contract_routes", [
    ["company_id", "INT NULL"],
    ["value_amount", "DECIMAL(16,2) NULL"],
  ]);
  await agregarColumnas(pool, "contract_activities", [
    ["category", "VARCHAR(80) NULL"],
    ["period_id", "INT NULL"],
    ["result", "TEXT NULL"],
  ]);
  await agregarColumnas(pool, "contract_users", [
    ["specialty", "VARCHAR(120) NULL"],
    ["status", "VARCHAR(30) NOT NULL DEFAULT 'activo'"],
    ["start_date", "DATE NULL"],
    ["end_date", "DATE NULL"],
  ]);

  // --- Migración: crear empresas a partir de entity_name -------------------
  // Los contratos existentes guardaban la entidad como texto libre.
  const [huerfanos] = await pool.query(
    "SELECT DISTINCT entity_name FROM contract_routes WHERE company_id IS NULL AND entity_name IS NOT NULL AND entity_name<>''"
  );
  for (const { entity_name } of huerfanos) {
    await pool.query(
      "INSERT INTO contract_companies (name, status) VALUES (?, 'activa') ON DUPLICATE KEY UPDATE name=VALUES(name)",
      [entity_name]
    );
    await pool.query(
      "UPDATE contract_routes SET company_id=(SELECT id FROM contract_companies WHERE name=?) WHERE company_id IS NULL AND entity_name=?",
      [entity_name, entity_name]
    );
  }

  listo = true;
  return pool;
}
