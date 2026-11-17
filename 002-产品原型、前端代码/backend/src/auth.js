import { Router } from 'express';
import { pbkdf2, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(pbkdf2);
const iterations = 210000;
const lifetime = 7 * 24 * 3600 * 1000;
const digest = token => createHash('sha256').update(token).digest('hex');
const readToken = req => /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
const userView = user => ({ id: user.id, username: user.username });

export function authRoutes(pool) {
  const router = Router();
  const attempts = new Map();
  router.use((req,res,next) => {
    if (!['/login','/register'].includes(req.path) || req.method !== 'POST') return next();
    const now = Date.now();
    for (const [key,value] of attempts) if (now >= value.reset) attempts.delete(key);
    const key = req.socket.remoteAddress;
    const value = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
    attempts.set(key, value);
    if (++value.count > 60) return res.status(429).json({error:'尝试次数过多，请15分钟后再试。'});
    next();
  });
  const issueSession = async (connection, req, user) => {
    const old = readToken(req);
    if (old) await connection.execute('DELETE FROM auth_sessions WHERE token_hash=?',[digest(old)]);
    const token = randomBytes(32).toString('base64url');
    await connection.execute('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)',[digest(token), user.id, new Date(Date.now()+lifetime)]);
    await connection.execute('DELETE FROM auth_sessions WHERE expires_at < UTC_TIMESTAMP(3)');
    return token;
  };
  const validate = body => {
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = body?.password;
    return { username, password, valid: /^[\p{L}\p{N}_-]{3,32}$/u.test(username) && typeof password === 'string' && [...password].length >= 6 && [...password].length <= 64 };
  };
  router.post('/register', async(req,res) => {
    const { username,password,valid } = validate(req.body);
    if (!valid) return res.status(400).json({error:'用户名需为3-32位中文、字母、数字、下划线或连字符；密码需为6-64位。'});
    const salt = randomBytes(16).toString('hex');
    // Match Python's PBKDF2: the hex salt is used as UTF-8 text, not decoded bytes.
    const hash = (await derive(password,salt,iterations,32,'sha256')).toString('hex');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute('INSERT INTO users(username,password_hash,password_salt,password_algorithm,password_iterations) VALUES (?,?,?,?,?)',[username,hash,salt,'pbkdf2_sha256',iterations]);
      const user = {id:result.insertId, username};
      const token = await issueSession(connection,req,user);
      await connection.commit();
      res.status(201).json({user,token});
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({error:'用户名已存在，请直接登录。'});
      throw error;
    } finally { connection.release(); }
  });
  router.post('/login', async(req,res) => {
    const {username,password,valid} = validate(req.body);
    if (!valid) return res.status(401).json({error:'用户名或密码不正确。'});
    const [rows] = await pool.execute('SELECT id,username,password_hash,password_salt,password_algorithm,password_iterations FROM users WHERE username=?',[username]);
    const user = rows[0];
    const count = user?.password_iterations || iterations;
    if (user && (user.password_algorithm !== 'pbkdf2_sha256' || count < 1 || count > 1000000)) throw new Error('Unsupported password format');
    const hash = await derive(password,user?.password_salt || 'unknown-user',count,32,'sha256');
    const stored = Buffer.from(user?.password_hash || '', 'hex');
    if (!user || stored.length !== hash.length || !timingSafeEqual(hash,stored)) return res.status(401).json({error:'用户名或密码不正确。'});
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const token = await issueSession(connection,req,user);
      await connection.commit();
      res.json({user:userView(user),token});
    } catch(error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  });
  router.get('/session', async(req,res) => {
    const token = readToken(req);
    if (!token) return res.json({authenticated:false,user:null});
    const [rows] = await pool.execute('SELECT u.id,u.username FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)',[digest(token)]);
    res.json({authenticated: Boolean(rows[0]), user:rows[0] ? userView(rows[0]) : null});
  });
  router.post('/logout', async(req,res) => {
    const token = readToken(req);
    if (token) await pool.execute('DELETE FROM auth_sessions WHERE token_hash=?',[digest(token)]);
    res.clearCookie('wuyin_session',{path:'/'}).json({loggedOut:true});
  });
  return router;
}
