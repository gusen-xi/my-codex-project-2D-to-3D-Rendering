import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
const username=process.argv[2];
if(!username){console.error('用法：node scripts/authorize-admin.js <现有产品用户名>');process.exit(2);}
const pool=mysql.createPool(config.database);
try{
  const [users]=await pool.execute('SELECT id FROM users WHERE username=?',[username]);
  if(users.length!==1)throw new Error('未找到唯一的现有产品账号。');
  const [admins]=await pool.query('SELECT singleton_id FROM super_admins');
  if(admins.length!==0)throw new Error('超级管理员表已有授权记录；此脚本不会覆盖或替换。');
  await pool.execute('INSERT INTO super_admins(singleton_id,user_id) VALUES (1,?)',[users[0].id]);
  console.log('已登记超级管理员账号。');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
