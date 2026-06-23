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
  // Item 4: download/bandwidth abuse guards (see services/downloadGuard.ts).
  // Per-IP concurrent stream cap — generous on purpose because the whole office
  // shares one NAT IP; it only blocks extreme parallel-connection abuse.
  downloadMaxConcurrentPerIp: parseInt(process.env['DOWNLOAD_MAX_CONCURRENT_PER_IP'] || '20', 10),
  // Per-connection speed ceiling in MB/s. 0 = unlimited (disabled). Enable once
  // a sane per-link speed for this server's uplink is chosen.
  downloadRateLimitMbps: parseFloat(process.env['DOWNLOAD_RATE_LIMIT_MBPS'] || '0'),
} as const;
