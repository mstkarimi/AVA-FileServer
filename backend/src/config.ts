function require_env(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env['PORT'] || '3000', 10),
  jwtSecret: require_env('JWT_SECRET'),
  adminUsername: require_env('ADMIN_USERNAME'),
  adminPassword: require_env('ADMIN_PASSWORD'),
  sftpUsername: require_env('SFTP_USERNAME'),
  sftpPassword: require_env('SFTP_PASSWORD'),
  publicUrl: require_env('PUBLIC_URL'),
  filesRoot: process.env['FILES_ROOT'] || '/data/files',
  trashRoot: process.env['TRASH_ROOT'] || '/data/trash',
  dbPath: process.env['DB_PATH'] || '/data/db/fileserver.db',
  jwtExpiry: '24h',
  uploadMaxBytes: 100 * 1024 * 1024, // 100 MB
  // Item 14: how long deleted items stay recoverable in the trash
  trashRetentionDays: parseInt(process.env['TRASH_RETENTION_DAYS'] || '30', 10),
} as const;
