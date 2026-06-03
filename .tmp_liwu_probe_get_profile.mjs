import WebSocket from 'ws';
const TARGET_PREFIX='http://localhost:5175/partner';
const LIST_URL='http://127.0.0.1:9222/json/list';
const fetchJson=async(url)=>{const r=await fetch(url); if(!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`); return r.json();};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const getTarget=async()=>{for(let i=0;i<20;i++){const list=await fetchJson(LIST_URL); const t=list.find(x=>x.type==='page'&&String(x.url||'').startsWith(TARGET_PREFIX)); if(t?.webSocketDebuggerUrl) return t; await sleep(250);} throw new Error('partner target not found');};
const createClient=async(url)=>{const ws=new WebSocket(url); const pending=new Map(); let nextId=1; ws.on('message',(raw)=>{const data=JSON.parse(String(raw)); if(typeof data.id==='number'&&pending.has(data.id)){const p=pending.get(data.id); clearTimeout(p.timer); pending.delete(data.id); if(data.error) p.reject(new Error(JSON.stringify(data.error))); else p.resolve(data.result||{});}}); await new Promise((res,rej)=>{ws.once('open',res); ws.once('error',rej);}); return {send:(method,params={},timeoutMs=15000)=>new Promise((resolve,reject)=>{const id=nextId++; const timer=setTimeout(()=>{pending.delete(id); reject(new Error(method+' timeout'));},timeoutMs); pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params}));}), close:()=>ws.close()};};
const expr=String.raw`(async () => {
  try {
    const mod = await import('/src/services/cloudbase.js');
    const authStatus = await mod.authService.getAuthStatus({ allowAnonymous: true });
    const profile = await mod.userProfileService.getCurrentProfile({ refresh: true, allowAnonymous: true });
    return {
      ok: true,
      authStatus,
      profile
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      stack: error?.stack || ''
    };
  }
})();`;
const main=async()=>{const target=await getTarget(); const client=await createClient(target.webSocketDebuggerUrl); try{await client.send('Runtime.enable'); const {result}=await client.send('Runtime.evaluate',{expression:expr, returnByValue:true, awaitPromise:true},30000); console.log(JSON.stringify(result?.value??result,null,2)); } finally { client.close(); }};
main().catch((e)=>{console.error(e); process.exit(1);});
