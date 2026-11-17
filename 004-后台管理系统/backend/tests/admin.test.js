import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
const frontendDir=fileURLToPath(new URL('../../frontend/dist',import.meta.url));

async function withServer(pool, fn) {
  const server=createApp({pool,authUrl:'http://127.0.0.1:1/login',configUrl:'http://127.0.0.1:1/config',frontendDir}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{return await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('management APIs reject requests without a bearer session',async()=>{
  const pool={query:async()=>{throw new Error('must not query without token');},execute:async()=>{throw new Error('must not query without token');}};
  await withServer(pool,async base=>{
    const response=await fetch(`${base}/api/admin/overview`);
    assert.equal(response.status,401);
    assert.equal((await response.json()).error,'请先登录。');
  });
});
test('a valid product session without the administrator grant is denied',async()=>{
  const pool={query:async()=>[[{count:1}]],execute:async()=>[[]]};
  await withServer(pool,async base=>{
    const response=await fetch(`${base}/api/admin/overview`,{headers:{Authorization:`Bearer ${'a'.repeat(43)}`}});
    assert.equal(response.status,403);
  });
});
test('invalid date filters are rejected before any listing query',async()=>{
  const pool={query:async()=>[[{count:1}]],execute:async sql=>sql.includes('auth_sessions')?[[{id:1,username:'admin'}]]:[[]]};
  await withServer(pool,async base=>{
    const response=await fetch(`${base}/api/admin/tasks?from=2026-99-99`,{headers:{Authorization:`Bearer ${'a'.repeat(43)}`}});
    assert.equal(response.status,400);
  });
});
test('review listing returns the submitted notes content',async()=>{
  const notes=JSON.stringify({overall:'partial',tags:['家具款式不符合预期'],comment:'请把沙发换成浅色布艺。'});
  const pool={
    query:async()=>[[{count:1}]],
    execute:async(sql)=>{
      if(sql.includes('auth_sessions'))return [[{id:1,username:'admin'}]];
      if(sql.startsWith('SELECT COUNT(*) AS total'))return [[{total:1}]];
      if(sql.includes('FROM version_reviews'))return [[{id:7,version_id:12,notes,username:'designer',project_name:'客厅设计'}]];
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  await withServer(pool,async base=>{
    const response=await fetch(`${base}/api/admin/reviews`,{headers:{Authorization:`Bearer ${'a'.repeat(43)}`}});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.items[0].notes,notes);
  });
});
test('the static admin app never serves file routes',async()=>{
  const pool={query:async()=>[[{count:0}]],execute:async()=>[[]]};
  await withServer(pool,async base=>{
    const response=await fetch(`${base}/outputs/private-plan.png`);
    assert.equal(response.status,404);
    const page=await fetch(`${base}/`);
    assert.equal(page.status,200);
    assert.match(await page.text(),/管理后台/);
  });
});
