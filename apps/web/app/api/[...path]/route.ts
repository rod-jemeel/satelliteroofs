import {NextRequest} from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,{params}:{params:Promise<{path:string[]}>}) {
  if(request.headers.get('host')!=='127.0.0.1:3210')return Response.json({detail:'Open the application at http://127.0.0.1:3210.'},{status:403});
  const {path}=await params;
  if(path.some(p=>p==='..'||p==='.'||p.includes('/')||p.includes('\\')))return new Response('Invalid route',{status:400});
  const headers=new Headers(request.headers);headers.set('x-roofready-internal',process.env.ROOFREADY_INTERNAL||'');headers.delete('host');headers.delete('connection');headers.delete('content-length');
  try {
    const upstream=await fetch('http://127.0.0.1:8137/api/'+path.map(encodeURIComponent).join('/')+request.nextUrl.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer(),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(150000)});
    const out=new Headers(upstream.headers);out.delete('content-encoding');out.delete('transfer-encoding');out.delete('content-length');
    return new Response(upstream.body,{status:upstream.status,headers:out});
  }catch{return Response.json({detail:'The local API is unavailable. Start SatelliteRoofs with npm run dev and keep its terminal open.'},{status:503});}
}
export {proxy as GET,proxy as POST,proxy as PUT,proxy as DELETE};
