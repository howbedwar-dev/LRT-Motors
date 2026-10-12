import postgres from 'postgres';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
const COOKIE='lrt_admin', prod=process.env.CONTEXT==='production'; let client;
const secret=()=>process.env.SESSION_SECRET||'';
const db=()=>{if(!process.env.NETLIFY_DB_URL)throw new Error('Netlify Database is not connected.');return client??=postgres(process.env.NETLIFY_DB_URL,{max:1,idle_timeout:20,connect_timeout:10})};
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const sign=s=>createHmac('sha256',secret()).update(s).digest('base64url');
const cookie=(v,age)=>`${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${prod?'; Secure':''}`;
function loggedIn(req){try{const c=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!c)return false;const [payload,mac]=c.split('.'),expected=Buffer.from(sign(payload)),actual=Buffer.from(mac||'');if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return false;const d=JSON.parse(Buffer.from(payload,'base64url').toString());return d.e>Date.now()&&d.u===process.env.ADMIN_USERNAME}catch{return false}}
const body=async req=>{const x=await req.json();if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Invalid request body');return x};
const txt=(v,n,max=180)=>{v=String(v??'').trim();if(!v||v.length>max)throw Error(`${n} is required (max ${max} characters).`);return v};
const num=(v,n,min=0)=>{const x=Number(v);if(!Number.isFinite(x)||x<min)throw Error(`${n} must be a valid number.`);return x};
export default async req=>{
 const path=new URL(req.url).pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
 try{
  if(path==='login'&&req.method==='POST'){
   const x=await body(req);if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD||!secret())return reply({error:'Set ADMIN_USERNAME, ADMIN_PASSWORD, and SESSION_SECRET in Netlify.'},503);
   const eq=(a,b)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y)};
   if(!eq(x.username,process.env.ADMIN_USERNAME)||!eq(x.password,process.env.ADMIN_PASSWORD))return reply({error:'Username or password did not match.'},401);
   const p=Buffer.from(JSON.stringify({u:x.username,e:Date.now()+28800000,n:randomUUID()})).toString('base64url');return reply({ok:true,username:x.username},200,{'set-cookie':cookie(p+'.'+sign(p),28800)});
  }
  if(path==='logout'&&req.method==='POST')return reply({ok:true},200,{'set-cookie':cookie('',0)});
  if(path==='session'&&req.method==='GET')return loggedIn(req)?reply({ok:true,username:process.env.ADMIN_USERNAME}):reply({ok:false},401);
  if(path==='listings'&&req.method==='GET'){const rows=await db()`SELECT id,make,model,year,trim,price,mileage,color,image_url FROM vehicles WHERE status='Available' ORDER BY created_at DESC`;return reply({vehicles:rows})}
  if(!loggedIn(req))return reply({error:'Sign in to continue.'},401);
  const q=db();
  if(path==='data'&&req.method==='GET'){
   const [vehicles,customers,sales,transactions]=await Promise.all([q`SELECT * FROM vehicles ORDER BY created_at DESC`,q`SELECT * FROM customers ORDER BY created_at DESC`,q`SELECT s.*,v.make,v.model,v.year,c.name AS customer_name FROM sales s LEFT JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.sale_date DESC`,q`SELECT t.*,c.name AS customer_name,v.make,v.model FROM transactions t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN vehicles v ON v.id=t.vehicle_id ORDER BY t.entry_date DESC,t.id DESC`]);return reply({vehicles,customers,sales,transactions});
  }
  if(path==='vehicles'&&req.method==='POST'){
   const x=await body(req),r=await q`INSERT INTO vehicles(stock_number,make,model,year,trim,price,cost,mileage,color,status,image_url) VALUES(${txt(x.stock_number,'Stock number',40)},${txt(x.make,'Make',70)},${txt(x.model,'Model',70)},${num(x.year,'Year',1886)},${String(x.trim||'').slice(0,70)},${num(x.price,'Price')},${num(x.cost||0,'Cost')},${num(x.mileage||0,'Mileage')},${String(x.color||'').slice(0,40)},${['Available','Reserved','Sold','Service'].includes(x.status)?x.status:'Available'},${String(x.image_url||'').slice(0,500)}) RETURNING *`;return reply(r[0],201);
  }
  if(path.startsWith('vehicles/')&&req.method==='DELETE'){await q`DELETE FROM vehicles WHERE id=${num(path.split('/')[1],'Vehicle ID',1)}`;return reply({ok:true})}
  if(path==='customers'&&req.method==='POST'){const x=await body(req),r=await q`INSERT INTO customers(name,email,phone,source,notes) VALUES(${txt(x.name,'Name',120)},${String(x.email||'').slice(0,160)},${String(x.phone||'').slice(0,50)},${String(x.source||'Walk-in').slice(0,60)},${String(x.notes||'').slice(0,1000)}) RETURNING *`;return reply(r[0],201)}
  if(path==='transactions'&&req.method==='POST'){
   const x=await body(req);if(!['income','expense'].includes(x.kind))throw Error('Choose income or expense.');const r=await q`INSERT INTO transactions(kind,category,description,amount,entry_date,customer_id,vehicle_id,payment_method) VALUES(${x.kind},${txt(x.category,'Category',80)},${txt(x.description,'Description',200)},${num(x.amount,'Amount')},${x.entry_date||new Date().toISOString().slice(0,10)},${x.customer_id?num(x.customer_id,'Customer ID',1):null},${x.vehicle_id?num(x.vehicle_id,'Vehicle ID',1):null},${String(x.payment_method||'Other').slice(0,50)}) RETURNING *`;return reply(r[0],201);
  }
  if(path.startsWith('transactions/')&&req.method==='DELETE'){await q`DELETE FROM transactions WHERE id=${num(path.split('/')[1],'Entry ID',1)}`;return reply({ok:true})}
  if(path==='sales'&&req.method==='POST'){
   const x=await body(req),vehicle=num(x.vehicle_id,'Vehicle',1),customer=num(x.customer_id,'Customer',1),price=num(x.sale_price,'Sale price'),date=x.sale_date||new Date().toISOString().slice(0,10);
   const sale=await q.begin(async tx=>{const cars=await tx`SELECT * FROM vehicles WHERE id=${vehicle} FOR UPDATE`;if(!cars.length||cars[0].status==='Sold')throw Error('Vehicle is unavailable.');const customers=await tx`SELECT id FROM customers WHERE id=${customer}`;if(!customers.length)throw Error('Customer was not found.');const invoice=`LRT-${Date.now().toString().slice(-8)}-${Math.floor(Math.random()*90+10)}`;const r=await tx`INSERT INTO sales(invoice_number,vehicle_id,customer_id,sale_price,sale_date,notes) VALUES(${invoice},${vehicle},${customer},${price},${date},${String(x.notes||'').slice(0,500)}) RETURNING *`;await tx`UPDATE vehicles SET status='Sold' WHERE id=${vehicle}`;await tx`INSERT INTO transactions(kind,category,description,amount,entry_date,customer_id,vehicle_id,payment_method) VALUES('income','Vehicle sale',${'Invoice '+invoice},${price},${date},${customer},${vehicle},${String(x.payment_method||'Other').slice(0,50)})`;return r[0]});return reply(sale,201);
  }
  return reply({error:'Not found.'},404);
 }catch(e){console.error('LRT API',e);return reply({error:e.message||'Server error.'},e.message?.includes('required')||e.message?.includes('valid number')||e.message?.includes('Choose')?400:500)}
};
export const config={path:'/api/*'};
