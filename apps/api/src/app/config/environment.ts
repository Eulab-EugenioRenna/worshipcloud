interface Environment {
  readonly DATABASE_URL: string;
  readonly REDIS_URL: string;
  readonly PORT: number;
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const databaseUrl = String(config['DATABASE_URL'] ?? '');
  const redisUrl = String(config['REDIS_URL'] ?? '');
  const port = Number(config['PORT'] ?? 3333);

  if (!databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL must be a Redis connection string');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  return { DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, PORT: port };
}
