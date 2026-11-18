import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const backendRoot = fileURLToPath(new URL('../', import.meta.url));
export const projectRoot = path.resolve(backendRoot, '../..');
export const frontendRoot = path.resolve(backendRoot, '../fronted');
const file = path.join(projectRoot, 'work/mysql/.env');
const local = existsSync(file) ? Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];})) : {};
export const config = {
  host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8766),
  demoMode: process.env.DEMO_MODE === '1',
  publicOrigin: process.env.PUBLIC_ORIGIN,
  pythonPort: Number(process.env.PYTHON_PORT || 8767),
  database: {
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || local.MYSQL_USER || 'wuyin',
    password: process.env.DB_PASSWORD || local.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || local.MYSQL_DATABASE || 'wuyin',
    charset: 'utf8mb4', timezone: 'Z', connectionLimit: 5,
    supportBigNumbers: true, bigNumberStrings: true,
    ...(process.env.DB_SSL === '1' ? {ssl:{rejectUnauthorized:true}} : {}),
  },
};
