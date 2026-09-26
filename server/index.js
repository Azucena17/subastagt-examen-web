import express from 'express';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { validateVehicle, placeBid, publicVehicle } from './domain.js';
import { seedVehicles } from './seed.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const app = express();
const firebaseMode = process.env.DATA_MODE === 'firebase';
const sqlMode = process.env.DATA_MODE === 'sqlserver';
const sessions = new Map();
const clients = new Set();
let state, database, adminAuth, sqlStore;
const file = resolve(process.env.DEMO_DATA_FILE || 'data/demo.json');
let firebaseKey = '';
if (firebaseMode) {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getDatabase } = await import('firebase-admin/database');
  const { getAuth } = await import('firebase-admin/auth');
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  firebaseKey = JSON.parse(process.env.FIREBASE_WEB_CONFIG || '{}').apiKey;
  if (!credentials.private_key || !firebaseKey || !process.env.FIREBASE_DATABASE_URL) throw new Error('Faltan las variables de Firebase. Revisa .env.example y README.md.');
  initializeApp({ credential: cert(credentials), databaseURL: process.env.FIREBASE_DATABASE_URL });
  database = getDatabase(); adminAuth = getAuth();
  state = {vehicles: (await database.ref('vehicles').get()).val() || {}};
  database.ref('vehicles').on('value', snap => { state.vehicles = snap.val() || {}; broadcast(); }, e => console.error('Firebase:', e.message));
} else if (sqlMode) {
  const {openSql}=await import('./sql-store.js'); sqlStore=await openSql();state=await sqlStore.load();
  for(let i=1;i<=3;i++) {
    const email=`usuario${i}@subastagt.test`;
    if(!state.users[email]) {const u={id:`demo-user-${i}`,name:`Usuario ${i}`,lastName:'Prueba',email,phone:'55550000',password:hash('Subasta2026!')};await sqlStore.addUser(u);state.users[email]=u;}
  }
  if(!Object.keys(state.vehicles).length) {state.vehicles=seedVehicles();for(const v of Object.values(state.vehicles))await sqlStore.addVehicle(v);}
} else {
  mkdirSync(resolve('data'), { recursive: true });
  state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {vehicles: seedVehicles(), users: {}};
  for (let i=1;i<=3;i++) {
    const email = `usuario${i}@subastagt.test`;
    if (!state.users[email]) state.users[email] = {id:`demo-user-${i}`,name:`Usuario ${i}`,lastName:'Prueba',email,phone:'55550000',password:hash('Subasta2026!')};
  }
  persist();
}
function hash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
function passwordMatches(password, stored) { const [salt,value] = stored.split(':'); return timingSafeEqual(Buffer.from(value,'hex'),scryptSync(password,salt,64)); }
function persist() { writeFileSync(`${file}.tmp`, JSON.stringify(state)); renameSync(`${file}.tmp`,file); }
function snapshot(user) { return {vehicles:Object.values(state.vehicles).map(v=>publicVehicle(v,user?.id)),serverTime:Date.now()}; }
function broadcast() { for (const c of clients) c.res.write(`data: ${JSON.stringify(snapshot(c.user))}\n\n`); }
function safeUser(user) { const {password,...safe} = user; return safe; }
function requireUser(req,res,next) { if (!req.user) return res.status(401).json({error:'Inicia sesión para continuar.'}); next(); }
app.disable('x-powered-by');
app.use(express.json({limit:'100kb'}));
app.use((req,res,next)=> {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control','no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({error:'Origen no permitido.'});
  const token = (req.headers.cookie || '').split('; ').find(c=>c.startsWith('session='))?.slice(8);
  const session = sessions.get(token);
  if (session?.expires > Date.now()) { req.user = session.user; req.sessionToken = token; }
  next();
});
function login(res,user) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token,{user:safeUser(user),expires:Date.now()+12*3600000});
  res.cookie('session',token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:12*3600000});
  res.json({user:safeUser(user)});
}
const attempts = new Map();
app.use('/api/auth',(req,res,next)=> {
  const key = req.ip; const entry = attempts.get(key) || {count:0,until:Date.now()+60000};
  if (Date.now()>entry.until) {entry.count=0;entry.until=Date.now()+60000;}
  attempts.set(key,entry);
  if (++entry.count>25) return res.status(429).json({error:'Demasiados intentos. Espera un minuto.'});
  next();
});
app.get('/api/config',(req,res)=>res.json({mode:firebaseMode?'firebase':sqlMode?'sqlserver':'demo'}));
app.get('/api/me',(req,res)=>res.json({user:req.user || null}));
app.post('/api/auth/register',async(req,res)=> {
  const {name,lastName,phone,password} = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (![name,lastName,phone].every(v=>typeof v==='string' && v.trim() && v.length<=80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || typeof password!=='string' || password.length<10 || password.length>128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(400).json({error:'Completa tus datos. La contraseña necesita 10 caracteres, mayúscula, minúscula, número y símbolo.'});
  if (firebaseMode) {
    const account = await adminAuth.createUser({email,password,displayName:`${name} ${lastName}`});
    const user = {id:account.uid,name,lastName,phone,email};
    await database.ref(`profiles/${account.uid}`).set(user); login(res,user);
  } else {
    if (state.users[email]) return res.status(409).json({error:'Ya existe una cuenta con ese correo.'});
    const user = {id:randomBytes(12).toString('hex'),name,lastName,phone,email,password:hash(password)};
    if(sqlMode)await sqlStore.addUser(user);
    state.users[email]=user;if(!sqlMode)persist();login(res,user);
  }
});
app.post('/api/auth/login',async(req,res)=> {
  const email=String(req.body.email || '').trim().toLowerCase(),password=req.body.password;
  if(typeof password!=='string' || password.length>128) return res.status(400).json({error:'Credenciales no válidas.'});
  if(firebaseMode) {
    const result=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
    const account=await result.json();
    if(!result.ok) return res.status(401).json({error:'Correo o contraseña incorrectos.'});
    const profile=(await database.ref(`profiles/${account.localId}`).get()).val();
    login(res,profile || {id:account.localId,email,name:account.displayName || 'Usuario',lastName:'',phone:''});
  } else {
    const user=state.users[email];
    if(!user || !passwordMatches(password,user.password)) return res.status(401).json({error:'Correo o contraseña incorrectos.'});
    login(res,user);
  }
});
app.post('/api/logout',(req,res)=> {
  sessions.delete(req.sessionToken);
  for(const c of clients) if(c.token===req.sessionToken) c.res.end();
  res.clearCookie('session').json({ok:true});
});
app.get('/api/vehicles',(req,res)=>res.json(snapshot(req.user)));
app.get('/api/events',(req,res)=> {
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  const client={res,user:req.user,token:req.sessionToken};clients.add(client);
  res.write(`data: ${JSON.stringify(snapshot(req.user))}\n\n`);
  req.on('close',()=>clients.delete(client));
});
setInterval(()=> {
  for(const [token,s] of sessions) if(s.expires<Date.now()) sessions.delete(token);
  for(const [key,a] of attempts) if(a.until<Date.now()) attempts.delete(key);
  for(const c of clients) {if(c.token && !sessions.has(c.token)) c.res.end();else c.res.write(': heartbeat\n\n');}
},15000).unref();
app.post('/api/vehicles',requireUser,async(req,res)=> {
  const fields=validateVehicle(req.body);
  const id=`GT-${randomBytes(5).toString('hex').toUpperCase()}`;
  const v={...fields,id,ownerId:req.user.id,current:0,bidCount:0,winnerId:null};
  if(firebaseMode) await database.ref(`vehicles/${id}`).set(v);else {if(sqlMode)await sqlStore.addVehicle(v);state.vehicles[id]=v;if(!sqlMode)persist();broadcast();}
  res.status(201).json({vehicle:publicVehicle(v,req.user.id)});
});
async function mutate(id,transform) {
  if(!/^[A-Za-z0-9-]{1,50}$/.test(id)) throw new Error('Identificador no válido.');
  if(sqlMode) {const next=await sqlStore.mutate(id,transform);state.vehicles[id]=next;broadcast();return next;}
  if(firebaseMode) {
    let failure;
    const result=await database.ref(`vehicles/${id}`).transaction(v=> {try {failure=null;return transform(v);}catch(e){failure=e;return;}},undefined,false);
    if(!result.committed) throw failure || new Error('No se pudo guardar. Intenta otra vez.');
    return result.snapshot.val();
  }
  const next=transform(state.vehicles[id]);state.vehicles[id]=next;persist();broadcast();return next;
}
app.put('/api/vehicles/:id',requireUser,async(req,res)=> {
  const fields=validateVehicle(req.body,Date.now(),true);
  const v=await mutate(req.params.id,old=> {
    if(!old || old.ownerId!==req.user.id) throw new Error('Solo puedes editar tus publicaciones.');
    if(old.bidCount>0 || Date.now()>=old.endsAt) throw new Error('No se puede editar una subasta con ofertas o finalizada.');
    return {...old,...fields};
  });res.json({vehicle:publicVehicle(v,req.user.id)});
});
app.post('/api/vehicles/:id/bids',requireUser,async(req,res)=> {
  const v=await mutate(req.params.id,old=>placeBid(old,req.user.id,req.body.amount));
  res.json({vehicle:publicVehicle(v,req.user.id)});
});
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
app.use(express.static(resolve('dist')));
app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));
app.use((err,req,res,next)=> {
  console.error(err.message);
  const message=err.code?.startsWith('auth/') ? 'No se pudo crear la cuenta. Revisa el correo o intenta iniciar sesión.' : err.message;
  res.status(400).json({error:message || 'No se pudo completar la operación.'});
});
app.listen(process.env.PORT || 3000,'0.0.0.0',()=>console.log(`SubastaGT: http://localhost:${process.env.PORT || 3000} · modo ${firebaseMode?'Firebase':sqlMode?'SQL Server':'demostración'}`));
