interface Environment {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly DATABASE_URL: string;
  readonly REDIS_URL: string;
  readonly PORT: number;
  readonly APP_URL: string;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_EMAIL: string;
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const nodeEnv = String(config['NODE_ENV'] ?? 'development');
  const databaseUrl = String(config['DATABASE_URL'] ?? '');
  const redisUrl = String(config['REDIS_URL'] ?? '');
  const port = Number(config['PORT'] ?? 3333);
  const appUrl = String(config['APP_URL'] ?? 'http://localhost:4200');
  const resendApiKey = String(config['RESEND_API_KEY'] ?? '');
  const resendFromEmail = String(config['RESEND_FROM_EMAIL'] ?? '');

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  if (!databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    throw new Error('REDIS_URL must be a Redis connection string');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
    throw new Error('APP_URL must be an HTTP or HTTPS URL');
  }

  if (resendApiKey && !resendApiKey.startsWith('re_')) {
    throw new Error('RESEND_API_KEY must start with re_');
  }

  if (nodeEnv === 'production' && (!resendApiKey || !resendFromEmail)) {
    throw new Error('Resend configuration is required in production');
  }

  return {
    NODE_ENV: nodeEnv as Environment['NODE_ENV'],
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    PORT: port,
    APP_URL: appUrl,
    RESEND_API_KEY: resendApiKey,
    RESEND_FROM_EMAIL: resendFromEmail,
  };
}
