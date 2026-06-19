export async function ensureFeatureSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS process_contents (
    process_id INT PRIMARY KEY, objective TEXT NULL, owner_name VARCHAR(180) NULL,
    scope TEXT NULL, subprocesses TEXT NULL, is_published TINYINT(1) NOT NULL DEFAULT 0,
    updated_by INT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pc_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INT PRIMARY KEY, photo_data MEDIUMBLOB NULL, photo_mime VARCHAR(100) NULL,
    bio TEXT NULL, phone VARCHAR(40) NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS contract_members (
    contract_id INT NOT NULL, user_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(contract_id,user_id),
    CONSTRAINT fk_cm_contract FOREIGN KEY(contract_id) REFERENCES contract_routes(id) ON DELETE CASCADE,
    CONSTRAINT fk_cm_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS forum_topics (
    id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(220) NOT NULL, body TEXT NOT NULL,
    author_id INT NOT NULL, contract_id INT NULL, is_published TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ft_author FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ft_contract FOREIGN KEY(contract_id) REFERENCES contract_routes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS forum_comments (
    id INT AUTO_INCREMENT PRIMARY KEY, topic_id INT NOT NULL, author_id INT NOT NULL, body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fc_topic FOREIGN KEY(topic_id) REFERENCES forum_topics(id) ON DELETE CASCADE,
    CONSTRAINT fk_fc_author FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
