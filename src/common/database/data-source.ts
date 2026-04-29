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
