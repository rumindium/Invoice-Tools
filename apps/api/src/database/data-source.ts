import { config } from 'dotenv';
import { join, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { entities } from './entities';

config({ path: resolve(__dirname, '../../../../.env') });
config({ path: resolve(process.cwd(), '.env'), override: false });

export function databaseOptions(): DataSourceOptions {
  const url = process.env['DATABASE_URL'];

  if (!url) {
    throw new Error('DATABASE_URL is required.');
  }

  return {
    type: 'postgres',
    url,
    entities,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: false,
  };
}

const AppDataSource = new DataSource(databaseOptions());

export default AppDataSource;
