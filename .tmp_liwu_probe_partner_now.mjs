import WebSocket from 'ws';
const TARGET_PREFIX='http://localhost:5175/partner';
const LIST_URL='http://127.0.0.1:9222/json/list';
const fetchJson=async(url)=>{const r=await fetch(url); if(!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`); return r.json();};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const getTarget=async()=>{for(let i=0;i<20;i++){const list=await fetchJson(LIST_URL); const t=list.find(x=>x.type==='page'&&String(x.url||'').startsWith(TARGET_PREFIX)); if(t?.webSocketDebuggerUrl) return t; await sleep(250);} throw new Error('partner target not found');};
const createClient=async(url)=>{const ws=new WebSocket(url); const pending=new Map(); let nextId=1; ws.on('message',(raw)=>{const data=JSON.parse(String(raw)); if(typeof data.id==='number'&&pending.has(data.id)){const p=pending.get(data.id); clearTimeout(p.timer); pending.delete(data.id); if(data.error) p.reject(new Error(JSON.stringify(data.error))); else p.resolve(data.result||{});}}); await new Promise((res,rej)=>{ws.once('open',res); ws.once('error',rej);}); return {send:(method,params={},timeoutMs=15000)=>new Promise((resolve,reject)=>{const id=nextId++; const timer=setTimeout(()=>{pending.delete(id); reject(new Error(method+' timeout'));},timeoutMs); pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params}));}), close:()=>ws.close()};};
const expr=String.raw`(() => {
  const sanitize = (value) => JSON.parse(JSON.stringify(value, (key, inner) => typeof inner === 'function' ? '[Function]' : inner));
  const getHookValue = (hook) => hook?.queue ? hook.memoizedState : (Array.isArray(hook?.memoizedState) && hook.memoizedState.length===2 ? hook.memoizedState[0] : hook?.memoizedState);
  const rootEl = document.querySelector('#root');
  const containerKey = rootEl ? Object.keys(rootEl).find((key) => key.startsWith('__reactContainer$')) : null;
  const rootContainer = containerKey ? rootEl[containerKey] : null;
  const start = rootContainer?.current || rootContainer?._internalRoot?.current || rootContainer;
  const seen = new Set();
  const stack = [start];
  let partnerFiber = null;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const name = current.elementType?.name || current.type?.name || '';
    if (name === 'Partner') { partnerFiber = current; break; }
    if (current.child) stack.push(current.child);
    if (current.sibling) stack.push(current.sibling);
  }
  if (!partnerFiber) return { ok:false, error:'partner_fiber_not_found' };
  const hooks=[]; let hook=partnerFiber.memoizedState; let idx=0;
  while(hook && idx<200){ hooks.push({ idx, value:getHookValue(hook) }); hook=hook.next; idx+=1; }
  const objHooks = hooks.filter((h)=>h.value && typeof h.value==='object' && !Array.isArray(h.value));
  return {
    ok:true,
    scalarStrings: hooks.filter((h)=>typeof h.value==='string').map((h)=>({idx:h.idx,value:h.value})).slice(0,50),
    scalarBooleans: hooks.filter((h)=>typeof h.value==='boolean').map((h)=>({idx:h.idx,value:h.value})).slice(0,30),
    userLike: objHooks.filter((h)=>('uid' in h.value)||('authUid' in h.value)||('phone' in h.value)||('storeId' in h.value)||('storeRole' in h.value)||('name' in h.value)).map((h)=>({idx:h.idx,value:sanitize(h.value)})).slice(0,30),
    authLike: objHooks.filter((h)=>('isAuthenticated' in h.value)||('phoneNumber' in h.value)||('isAnonymous' in h.value)||('displayName' in h.value)).map((h)=>({idx:h.idx,value:sanitize(h.value)})).slice(0,20),
    localStorage: Object.fromEntries(Object.keys(localStorage).filter((key)=>key.includes('liwu_')).map((key)=>[key, localStorage.getItem(key)]))
  };
})();`;
const main=async()=>{const target=await getTarget(); const client=await createClient(target.webSocketDebuggerUrl); try{await client.send('Runtime.enable'); const {result}=await client.send('Runtime.evaluate',{expression:expr, returnByValue:true, awaitPromise:true},30000); console.log(JSON.stringify(result?.value??result,null,2)); } finally { client.close(); }};
main().catch((e)=>{console.error(e); process.exit(1);});
