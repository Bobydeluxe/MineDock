export const migrations = [
  {
    version: 1,
    sql: `
    CREATE TABLE servers (id TEXT PRIMARY KEY, profile TEXT NOT NULL, secret TEXT NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE backups (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id), metadata TEXT NOT NULL, path TEXT NOT NULL);
    CREATE TABLE schedules (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id), metadata TEXT NOT NULL);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, server_id TEXT, detail TEXT NOT NULL, success INTEGER NOT NULL);
    CREATE TABLE metrics (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, at TEXT NOT NULL, cpu REAL NOT NULL, memory REAL NOT NULL, players INTEGER NOT NULL);
    CREATE INDEX metrics_by_server_time ON metrics(server_id, at);
    CREATE TABLE installed_content (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, metadata TEXT NOT NULL);
    CREATE TABLE player_history (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, name TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY(server_id, name));
    CREATE TABLE runtime_versions (major INTEGER PRIMARY KEY, metadata TEXT NOT NULL);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, at TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0);
  `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE operations (id TEXT PRIMARY KEY, server_id TEXT, metadata TEXT NOT NULL, checkpoint TEXT);
      CREATE INDEX operations_by_server ON operations(server_id);
      CREATE TABLE download_partials (destination TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE content_history (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, content_id TEXT NOT NULL, metadata TEXT NOT NULL);
      CREATE TABLE player_observations (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, name TEXT NOT NULL, metadata TEXT NOT NULL, PRIMARY KEY(server_id, name));
      CREATE TABLE retention_policies (server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE, metadata TEXT NOT NULL);
      CREATE TABLE managed_runtimes (id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE import_history (id TEXT PRIMARY KEY, server_id TEXT REFERENCES servers(id) ON DELETE SET NULL, metadata TEXT NOT NULL);
      CREATE TABLE marketplace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE storage_snapshots (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, at TEXT NOT NULL, metadata TEXT NOT NULL, PRIMARY KEY(server_id, at));
    `,
  },
  {
    version: 3,
    sql: `CREATE TABLE world_history (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, name TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, metadata TEXT NOT NULL);
      CREATE INDEX world_history_by_server_name ON world_history(server_id, name, at);`,
  },
  {
    version: 4,
    sql: `CREATE TABLE modpack_imports (token TEXT PRIMARY KEY, server_id TEXT REFERENCES servers(id) ON DELETE SET NULL, metadata TEXT NOT NULL);
    CREATE TABLE authorized_exports (id TEXT PRIMARY KEY, path TEXT NOT NULL, created_at TEXT NOT NULL);`,
  },
  {
    version: 5,
    sql: `CREATE TABLE backup_retention_runs (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, metadata TEXT NOT NULL);`,
  },
  {
    version: 6,
    sql: `
      DELETE FROM marketplace_settings WHERE key='curseforge-key';
      UPDATE marketplace_settings SET value='1' WHERE key='content-history-limit' AND CAST(value AS INTEGER)<1;
      UPDATE installed_content SET metadata=json_set(metadata,'$.provider','local','$.source','local') WHERE json_extract(metadata,'$.provider')='curseforge';
      UPDATE content_history SET metadata=json_set(metadata,'$.item.provider','local','$.item.source','local') WHERE json_extract(metadata,'$.item.provider')='curseforge';
      UPDATE operations SET checkpoint=replace(checkpoint,'"provider":"curseforge"','"provider":"local"') WHERE checkpoint IS NOT NULL;
      CREATE TABLE mod_cache (key TEXT PRIMARY KEY, metadata TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE mod_favorites (project_id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE mod_collections (id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE mod_events (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, at TEXT NOT NULL, metadata TEXT NOT NULL);
      CREATE INDEX mod_events_by_server_time ON mod_events(server_id,at);
    `,
  },
  {
    version: 7,
    sql: `CREATE TABLE survival_notices (id TEXT PRIMARY KEY, server_id TEXT REFERENCES servers(id) ON DELETE CASCADE, code TEXT NOT NULL, metadata TEXT NOT NULL);
    CREATE INDEX survival_notices_by_server ON survival_notices(server_id,code);
  `,
  },
];
