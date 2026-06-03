import WebSocket from 'ws';
const TARGET_PREFIX='http://localhost:5175/profile';
const LIST_URL='http://127.0.0.1:9222/json/list';
const fetchJson=async(url)=>{const r=await fetch(url); if(!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`); return r.json();};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const getTarget=async()=>{for(let i=0;i<20;i++){const list=await fetchJson(LIST_URL); const t=list.find(x=>x.type==='page'&&String(x.url||'').startsWith(TARGET_PREFIX)); if(t?.webSocketDebuggerUrl) return t; await sleep(250);} throw new Error('profile target not found');};
const createClient=async(url)=>{const ws=new WebSocket(url); const pending=new Map(); const listeners=new Map(); let nextId=1; ws.on('message',(raw)=>{const data=JSON.parse(String(raw)); if(typeof data.id==='number'&&pending.has(data.id)){const p=pending.get(data.id); clearTimeout(p.timer); pending.delete(data.id); if(data.error) p.reject(new Error(JSON.stringify(data.error))); else p.resolve(data.result||{}); return;} if(data.method){(listeners.get(data.method)||[]).forEach(fn=>fn(data.params||{}));}}); await new Promise((res,rej)=>{ws.once('open',res); ws.once('error',rej);}); return {send:(method,params={},timeoutMs=15000)=>new Promise((resolve,reject)=>{const id=nextId++; const timer=setTimeout(()=>{pending.delete(id); reject(new Error(method+' timeout'));},timeoutMs); pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params}));}), once:(method,timeoutMs=15000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.set(method,(listeners.get(method)||[]).filter(fn=>fn!==onEvent)); reject(new Error(method+' timeout'));},timeoutMs); const onEvent=(params)=>{clearTimeout(timer); listeners.set(method,(listeners.get(method)||[]).filter(fn=>fn!==onEvent)); resolve(params);}; listeners.set(method,[...(listeners.get(method)||[]),onEvent]);}), close:()=>ws.close()};};
const expr=String.raw`(() => ({
  mockPhoneSession: JSON.parse(localStorage.getItem('liwu_mock_phone_auth_session') || 'null'),
  phoneIdentitySession: JSON.parse(localStorage.getItem('liwu_phone_identity_session') || 'null'),
  awarenessUserCacheKeys: Object.keys(localStorage).filter((key)=>key.startsWith('liwu_awareness_user_cache_v1:')),
  title: document.title
}))();`;
const main=async()=>{const target=await getTarget(); const client=await createClient(target.webSocketDebuggerUrl); try{await client.send('Page.enable'); await client.send('Runtime.enable'); const loadEvent=client.once('Page.loadEventFired',15000).catch(()=>null); await client.send('Page.reload',{ignoreCache:true}); await loadEvent; await sleep(2000); const {result}=await client.send('Runtime.evaluate',{expression:expr, returnByValue:true, awaitPromise:true},30000); console.log(JSON.stringify(result?.value??result,null,2)); } finally { client.close(); }};
main().catch((e)=>{console.error(e); process.exit(1);});
