// Keep the cloud gallery limited to the sample files included in the repository.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
const available=url=>typeof url==='string' && url.startsWith('/assets/') && existsSync(path.join(root,url));
for(const [name,field] of [['references.json','url'],['collections.json','cover']]) {
  const file=path.join(root,'assets',name);
  const rows=JSON.parse(readFileSync(file,'utf8')).filter(row=>available(row[field]));
  if(!rows.length)throw new Error('Cloud gallery has no publishable sample assets');
  writeFileSync(file,JSON.stringify(rows,null,2));
}
