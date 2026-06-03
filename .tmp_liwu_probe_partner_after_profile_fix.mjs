import WebSocket from 'ws';
const TARGET_PREFIX='http://localhost:5175/partner';
const LIST_URL='http://127.0.0.1:9222/json/list';
const fetchJson=async(url)=>{const r=await fetch(url); if(!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`); return r.json();};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const getTarget=async()=>{for(let i=0;i<20;i++){const list=await fetchJson(LIST_URL); const t=list.find(x=>x.type==='page'&&String(x.url||'').startsWith(TARGET_PREFIX)); if(t?.webSocketDebuggerUrl) return t; await sleep(250);} throw new Error('partner target not found');};
const createClient=async(url)=>{const ws=new WebSocket(url); const pending=new Map(); const listeners=new Map(); let nextId=1; ws.on('message',(raw)=>{const data=JSON.parse(String(raw)); if(typeof data.id==='number'&&pending.has(data.id)){const p=pending.get(data.id); clearTimeout(p.timer); pending.delete(data.id); if(data.error) p.reject(new Error(JSON.stringify(data.error))); else p.resolve(data.result||{}); return;} if(data.method){(listeners.get(data.method)||[]).forEach(fn=>fn(data.params||{}));}}); await new Promise((res,rej)=>{ws.once('open',res); ws.once('error',rej);}); return {send:(method,params={},timeoutMs=15000)=>new Promise((resolve,reject)=>{const id=nextId++; const timer=setTimeout(()=>{pending.delete(id); reject(new Error(method+' timeout'));},timeoutMs); pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params}));}), once:(method,timeoutMs=15000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.set(method,(listeners.get(method)||[]).filter(fn=>fn!==onEvent)); reject(new Error(method+' timeout'));},timeoutMs); const onEvent=(params)=>{clearTimeout(timer); listeners.set(method,(listeners.get(method)||[]).filter(fn=>fn!==onEvent)); resolve(params);}; listeners.set(method,[...(listeners.get(method)||[]),onEvent]);}), close:()=>ws.close()};};
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
  while(hook && idx<220){ hooks.push({ idx, value:getHookValue(hook) }); hook=hook.next; idx+=1; }
  const valueAt=(idx)=>hooks.find((h)=>h.idx===idx)?.value;
  const arr=(idx)=>Array.isArray(valueAt(idx)) ? { length:valueAt(idx).length, sample:sanitize(valueAt(idx).slice(0,3)) } : sanitize(valueAt(idx));
  return {
    ok:true,
    resolvedProfileUser: sanitize(valueAt(0)),
    activeRole: valueAt(1),
    activeModule: valueAt(2),
    verifiedPhone: valueAt(4),
    liveShopCategories: arr(11),
    liveShopProducts: arr(12),
    livePartnerUsers: arr(17),
    livePartnerBrands: arr(18),
    livePartnerBrandMembers: arr(19),
    partnerDataErrors: sanitize(valueAt(29)),
    localStorage: Object.fromEntries(Object.keys(localStorage).filter((key)=>key.includes('liwu_mock_phone_auth_session')).map((key)=>[key, localStorage.getItem(key)]))
  };
})();`;
const main=async()=>{const target=await getTarget(); const client=await createClient(target.webSocketDebuggerUrl); try{await client.send('Page.enable'); await client.send('Runtime.enable'); const loadEvent=client.once('Page.loadEventFired',15000).catch(()=>null); await client.send('Page.reload',{ignoreCache:true}); await loadEvent; await sleep(2500); const {result}=await client.send('Runtime.evaluate',{expression:expr, returnByValue:true, awaitPromise:true},30000); console.log(JSON.stringify(result?.value??result,null,2)); } finally { client.close(); }};
main().catch((e)=>{console.error(e); process.exit(1);});
