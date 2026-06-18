CREATE TABLE IF NOT EXISTS workspace_folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  parent_id INT NULL,
  name VARCHAR(180) NOT NULL,
  section VARCHAR(30) NOT NULL DEFAULT 'personal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workspace_folders_user (user_id),
  INDEX idx_workspace_folders_parent (parent_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  folder_id INT NULL,
  repo_document_id INT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'personal',
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NULL,
  file_path VARCHAR(255) NULL,
  mime_type VARCHAR(160) NULL,
  size_bytes BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workspace_files_user (user_id),
  INDEX idx_workspace_files_folder (folder_id),
  INDEX idx_workspace_files_repo_doc (repo_document_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorite_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  document_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_favorite_document (user_id, document_id),
  INDEX idx_favorite_user (user_id),
  INDEX idx_favorite_document (document_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;