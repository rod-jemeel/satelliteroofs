import EmbeddedPostgres from 'embedded-postgres';
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync,unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const runtime=path.join(root,'.runtime'); mkdirSync(runtime,{recursive:true});
const runtimeConfigPath=path.join(runtime,'runtime.json');
const runtimeConfig=existsSync(runtimeConfigPath)?JSON.parse(readFileSync(runtimeConfigPath,'utf8')):{};
const python=process.env.ROOFREADY_PYTHON || (runtimeConfig.python?path.resolve(root,runtimeConfig.python):path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'));
if(!existsSync(python)) throw Error('Run scripts/setup.ps1 first, or set ROOFREADY_PYTHON.');
const configPath=path.join(runtime,'local.json');
let config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{password:randomBytes(24).toString('hex'), internal:randomBytes(32).toString('hex')};
writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
if(process.platform==='win32') {
  await new Promise((resolve,reject)=>{const p=spawn('icacls.exe',[runtime,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`],{windowsHide:true,stdio:'ignore'});p.on('exit',c=>c?reject(Error('Could not protect runtime directory')):resolve());});
}
let pg;
const env={...process.env, ROOFREADY_ROOT:root, ROOFREADY_INTERNAL:config.internal, PYTHONPATH:path.join(root,'services/api'), PYTHONUNBUFFERED:'1'};
if(!env.DATABASE_URL) {
  pg=new EmbeddedPostgres({databaseDir:path.join(runtime,'postgres'),user:'roofready',password:config.password,port:55439,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','max_connections=30'],onLog:()=>{},onError:m=>console.error(String(m))});
  if(!existsSync(path.join(runtime,'postgres','PG_VERSION'))) await pg.initialise();
  await pg.start();
  const client=pg.getPgClient(); await client.connect();
  const found=await client.query("SELECT 1 FROM pg_database WHERE datname='roofready'");
  await client.end();
  if(!found.rowCount) await pg.createDatabase('roofready');
  env.DATABASE_URL=`postgresql+${process.env.ROOFREADY_PG_DRIVER||runtimeConfig.driver||'psycopg'}://roofready:${config.password}@127.0.0.1:55439/roofready`;
}
const children=[];
const launch=(exe,args,cwd=root)=>{const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:'inherit'});children.push(child);child.on('error',console.error);return child;};
await new Promise((resolve,reject)=>{const p=spawn(python,['scripts/migrate.py'],{cwd:root,env,windowsHide:true,stdio:'inherit'});p.on('exit',c=>c?reject(Error('Database migration failed. Do not bypass migration errors.')):resolve());});
const api=launch(python,['-m','uvicorn','rr.main:app','--host','127.0.0.1','--port','8137','--no-access-log']);
let ready=false;for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,500));try{if((await fetch('http://127.0.0.1:8137/health')).ok){ready=true;break;}}catch{}}
if(!ready) throw Error('API did not start. Inspect preceding errors.');
if(process.argv.includes('--backend-only')) console.log('Backend ready');
else {launch(python,['services/worker/main.py']);launch(process.execPath,['node_modules/next/dist/bin/next',process.argv.includes('--production')?'start':'dev','--hostname','127.0.0.1','--port','3210'],path.join(root,'apps/web'));}
console.log('SatelliteRoofs: http://127.0.0.1:3210');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;for(const c of children){if(process.platform==='win32'&&c.pid)await new Promise(resolve=>{const p=spawn('taskkill.exe',['/PID',String(c.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('exit',resolve)});else c.kill();}if(pg)await pg.stop();if(existsSync(path.join(runtime,'stop.request')))unlinkSync(path.join(runtime,'stop.request'));process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
if(existsSync(path.join(runtime,'stop.request')))unlinkSync(path.join(runtime,'stop.request'));
setInterval(()=>{if(existsSync(path.join(runtime,'stop.request')))void stop()},1000);
await new Promise(()=>{});
