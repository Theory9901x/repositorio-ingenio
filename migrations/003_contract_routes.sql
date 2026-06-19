CREATE TABLE IF NOT EXISTS contract_routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  code VARCHAR(80) NULL,
  entity_name VARCHAR(180) NULL,
  description TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'activo',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  section VARCHAR(40) NOT NULL DEFAULT 'soporte',
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  file_name VARCHAR(255) NULL,
  file_path VARCHAR(255) NULL,
  mime_type VARCHAR(160) NULL,
  size_bytes BIGINT NULL,
  visibility VARCHAR(30) NOT NULL DEFAULT 'general',
  owner_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;