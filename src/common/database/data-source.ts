import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

const isProd = process.env.NODE_ENV === 'production';
const ssl = isProd ? { rejectUnauthorized: false } : false;

const baseOptions = {
  entities: [__dirname + '/../../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/../../migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  ssl,
  // Explicitly size the pg connection pool. Without this, node-postgres
  // defaults to max 10, and the purchase path holds a connection for the
  // whole checkout transaction — under a burst of concurrent buyers the
  // 11th+ request would queue indefinitely. Fail fast instead.
  extra: {
    // Sized for a burst of concurrent checkouts. Buyers of the same batch
    // serialize on that row's lock (to prevent oversell), so a request may
    // hold its connection briefly while queued — the pool must be wide enough
    // and the acquire timeout patient enough that they QUEUE rather than fail.
    // Keep `max` under Postgres `max_connections` (default 100), leaving room
    // for the expiry cron and admin/psql sessions.
    max: Number(process.env.DATABASE_POOL_MAX ?? 50),
    connectionTimeoutMillis: Number(
      process.env.DATABASE_CONN_TIMEOUT_MS ?? 15000,
    ),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000),
  },
};

export const dataSourceOptions: DataSourceOptions = process.env.DATABASE_URL
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ...baseOptions,
    }
  : {
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? 'easy',
      password: process.env.DATABASE_PASSWORD ?? 'easy',
      database: process.env.DATABASE_NAME ?? 'easyticket',
      ...baseOptions,
    };

export default new DataSource(dataSourceOptions);
