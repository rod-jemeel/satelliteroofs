let csrf='';
let initializing:Promise<void>|null=null;
export async function init(){
  if(!initializing)initializing=fetch('/api/v1/session',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error((await r.json()).detail||'Local API unavailable');csrf=(await r.json()).csrf;}).catch(e=>{initializing=null;throw e;});
  return initializing;
}
export async function api<T=unknown>(path:string,method='GET',body?:unknown,key?:string):Promise<T>{
  await init();const headers:Record<string,string>={'x-csrf-token':csrf};
  if(key)headers['Idempotency-Key']=key;
  if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch('/api/v1'+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await r.json();
  if(!r.ok){const detail=Array.isArray(result.detail)?result.detail.map((d:{msg:string})=>d.msg).join('; '):result.detail;throw Error(detail||'The request could not be completed.');}
  return result as T;
}
