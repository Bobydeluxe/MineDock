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
];
