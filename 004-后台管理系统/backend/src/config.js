import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const envPath = path.join(root, 'work/mysql/.env');
const local = existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; })) : {};
export const config = {
  host: '127.0.0.1', port: Number(process.env.ADMIN_PORT || 8770),
  authUrl: 'http://127.0.0.1:8766/api/auth/login',
  configUrl: 'http://127.0.0.1:8766/api/config',
  database: { host:process.env.DB_HOST||'127.0.0.1', port:Number(process.env.DB_PORT||3306), user:process.env.DB_USER||local.MYSQL_USER||'wuyin', password:process.env.DB_PASSWORD||local.MYSQL_PASSWORD||'', database:process.env.DB_NAME||local.MYSQL_DATABASE||'wuyin', charset:'utf8mb4', timezone:'Z', connectionLimit:5, supportBigNumbers:true, bigNumberStrings:true },
};
