import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('API: autenticación, privacidad, edición, concurrencia y eventos en vivo',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'subastagt-test-'));
  const port=31987,root=`http://127.0.0.1:${port}`;
  const proc=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),DATA_MODE:'demo',DEMO_DATA_FILE:join(folder,'demo.json')},stdio:['ignore','pipe','pipe']});
  let stderr='';proc.stderr.on('data',d=>stderr+=d);
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Servidor no arrancó: '+stderr)),15000);proc.stdout.on('data',d=>{if(d.toString().includes('SubastaGT:')){clearTimeout(timer);resolve();}});proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Salida '+code+stderr));});});
    async function request(path,body,cookie='',method='POST') {const res=await fetch(root+'/api'+path,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
    const anon=await request('/vehicles');const v=anon.data.vehicles[0];
    assert.equal(anon.status,200);assert.equal('ownerId' in v,false);
    assert.equal((await request(`/vehicles/${v.id}/bids`,{amount:v.base})).status,401);
    const a=await request('/auth/login',{email:'usuario1@subastagt.test',password:'Subasta2026!'});
    const b=await request('/auth/login',{email:'usuario2@subastagt.test',password:'Subasta2026!'});
    assert.equal(a.status,200);assert.ok(a.cookie);
    assert.equal((await request('/auth/login',{email:'usuario1@subastagt.test',password:'wrong'})).status,401);
    const ac=new AbortController();const event=await fetch(root+'/api/events',{headers:{cookie:a.cookie},signal:ac.signal});const reader=event.body.getReader();await reader.read();
    const results=await Promise.all([request(`/vehicles/${v.id}/bids`,{amount:v.base},a.cookie),request(`/vehicles/${v.id}/bids`,{amount:v.base},b.cookie)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
    const update=await reader.read();assert.match(new TextDecoder().decode(update.value),/"bidCount":1/);ac.abort();
    assert.equal((await request(`/vehicles/${v.id}/bids`,{amount:v.base+1},b.cookie)).status,400);
    const second=await request(`/vehicles/${v.id}/bids`,{amount:Math.ceil(v.base*1.1)},b.cookie);assert.equal(second.status,200);assert.equal(second.data.vehicle.isWinning,true);
    const me=await request('/vehicles',undefined,a.cookie);assert.equal(JSON.stringify(me.data).includes('winnerId'),false);
    const draft={...v,startsAt:Date.now()+60000,endsAt:Date.now()+3600000};
    const created=await request('/vehicles',draft,a.cookie);assert.equal(created.status,201);const id=created.data.vehicle.id;
    assert.equal((await request(`/vehicles/${id}`,{...draft,model:'Editado'},b.cookie,'PUT')).status,400);
    const edited=await request(`/vehicles/${id}`,{...draft,model:'Editado'},a.cookie,'PUT');assert.equal(edited.status,200);assert.equal(edited.data.vehicle.model,'Editado');
    assert.equal((await request(`/vehicles/${id}/bids`,{amount:draft.base},b.cookie)).status,400);
    assert.equal((await request('/auth/register',{name:'Ana',lastName:'López',phone:'55551234',email:'ana@example.test',password:'Segura2026!'})).status,200);
    await request('/logout',{},a.cookie);assert.equal((await request('/me',undefined,a.cookie)).data.user,null);
  } finally {proc.kill();await new Promise(r=>proc.once('exit',r));await rm(folder,{recursive:true,force:true});}
});
