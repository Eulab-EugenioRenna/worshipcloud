interface Environment {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly DATABASE_URL: string;
  readonly REDIS_URL: string;
  readonly PORT: number;
  readonly APP_URL: string;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_EMAIL: string;
  readonly LIBRETRANSLATE_URL: string;
  readonly LIBRETRANSLATE_API_KEY: string;
  readonly IMPORT_SOURCES_JSON: string;
  readonly JWT_SECRET: string;
  readonly JWT_ACCESS_TTL_MINUTES: number;
  readonly JWT_REFRESH_TTL_DAYS: number;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const nodeEnv = String(config['NODE_ENV'] ?? 'development');
  const databaseUrl = String(config['DATABASE_URL'] ?? '');
  const redisUrl = String(config['REDIS_URL'] ?? '');
  const port = Number(config['PORT'] ?? 3333);
  const appUrl = String(config['APP_URL'] ?? 'http://localhost:4200');
  const resendApiKey = String(config['RESEND_API_KEY'] ?? '');
  const resendFromEmail = String(config['RESEND_FROM_EMAIL'] ?? '');
  const libreTranslateUrl = String(
    config['LIBRETRANSLATE_URL'] ?? 'http://localhost:5000',
  ).replace(/\/$/, '');
  const libreTranslateApiKey = String(config['LIBRETRANSLATE_API_KEY'] ?? '');
  const importSourcesJson = String(config['IMPORT_SOURCES_JSON'] ?? '[]');
  const jwtSecret = String(
    config['JWT_SECRET'] ??
      (nodeEnv === 'production' ? '' : 'local-development-secret-change-me'),
  );
  const jwtAccessTtlMinutes = Number(config['JWT_ACCESS_TTL_MINUTES'] ?? 15);
  const jwtRefreshTtlDays = Number(config['JWT_REFRESH_TTL_DAYS'] ?? 30);

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
  if (
    !libreTranslateUrl.startsWith('http://') &&
    !libreTranslateUrl.startsWith('https://')
  ) {
    throw new Error('LIBRETRANSLATE_URL must be an HTTP or HTTPS URL');
  }
  try {
    JSON.parse(importSourcesJson);
  } catch {
    throw new Error('IMPORT_SOURCES_JSON must be valid JSON');
  }

  if (resendApiKey && !resendApiKey.startsWith('re_')) {
    throw new Error('RESEND_API_KEY must start with re_');
  }

  if (nodeEnv === 'production' && (!resendApiKey || !resendFromEmail)) {
    throw new Error('Resend configuration is required in production');
  }

  if (nodeEnv === 'production' && jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must contain at least 32 characters in production',
    );
  }

  if (!Number.isInteger(jwtAccessTtlMinutes) || jwtAccessTtlMinutes < 1) {
    throw new Error('JWT_ACCESS_TTL_MINUTES must be a positive integer');
  }

  if (!Number.isInteger(jwtRefreshTtlDays) || jwtRefreshTtlDays < 1) {
    throw new Error('JWT_REFRESH_TTL_DAYS must be a positive integer');
  }

  return {
    NODE_ENV: nodeEnv as Environment['NODE_ENV'],
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    PORT: port,
    APP_URL: appUrl,
    RESEND_API_KEY: resendApiKey,
    RESEND_FROM_EMAIL: resendFromEmail,
    LIBRETRANSLATE_URL: libreTranslateUrl,
    LIBRETRANSLATE_API_KEY: libreTranslateApiKey,
    IMPORT_SOURCES_JSON: importSourcesJson,
    JWT_SECRET: jwtSecret,
    JWT_ACCESS_TTL_MINUTES: jwtAccessTtlMinutes,
    JWT_REFRESH_TTL_DAYS: jwtRefreshTtlDays,
  };
}
