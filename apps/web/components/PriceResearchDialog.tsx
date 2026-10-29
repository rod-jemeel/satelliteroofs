'use client';
import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ExternalLink,Loader2,Search,Sparkles} from 'lucide-react';
import {api} from '@/lib/api';
import {usd,type Connection} from '@/lib/types';
import type {PriceResearch,PricingBasis,PriceProposal,MaterialQuote} from '@/lib/price-research';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';

export default function PriceResearchDialog({open,onOpenChange,onApply,onSettings,defaultLocation=''}:{open:boolean;onOpenChange:(open:boolean)=>void;onApply:(proposal:PriceProposal)=>void;onSettings:()=>void;defaultLocation?:string}){
 const [query,setQuery]=useState('Architectural asphalt shingles and synthetic underlayment'),[location,setLocation]=useState(defaultLocation);
 const locationEdited=useRef(false);
 useEffect(()=>{if(!locationEdited.current)setLocation(defaultLocation)},[defaultLocation]);
 const [record,setRecord]=useState<PriceResearch>(),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[applying,setApplying]=useState(false),[error,setError]=useState('');
 const [waste,setWaste]=useState('0'),[laborLow,setLaborLow]=useState(''),[laborHigh,setLaborHigh]=useState(''),[reviewed,setReviewed]=useState(false);
 const attempt=useRef<{key:string;payload:string}|null>(null);
 const {data:connection,isLoading}=useQuery({queryKey:['connection'],queryFn:()=>api<Connection>('/ai/connection'),enabled:open,refetchOnMount:'always'});
 const {data:latest}=useQuery({queryKey:['latest-price-research'],queryFn:()=>api<PriceResearch|null>('/price-research/latest'),enabled:open,refetchOnMount:'always'});
 const ready=connection?.status==='ready';
 const quotes=record?.status==='completed'?record.quotes:[],chosen=quotes.filter(q=>selected.includes(q.id));
 const material=chosen.reduce((total,q)=>total+Number(q.price_usd)/Number(q.coverage_ft2),0)*(1+Number(waste)/100);
 const valid=chosen.length>0&&waste.trim()!==''&&Number.isFinite(Number(waste))&&Number(waste)>=0&&Number(waste)<=30&&laborLow.trim()!==''&&laborHigh.trim()!==''&&Number.isFinite(Number(laborLow))&&Number.isFinite(Number(laborHigh))&&Number(laborLow)>=0&&Number(laborHigh)>=Number(laborLow)&&material+Number(laborLow)>=.5&&material+Number(laborHigh)<=100;
 const changed=()=>{setReviewed(false)};
 async function research(fresh=false){
  const body={query:query.trim(),location:location.trim()},payload=JSON.stringify(body);
  if(fresh||attempt.current?.payload!==payload)attempt.current={key:crypto.randomUUID(),payload};
  setBusy(true);setError('');setRecord(undefined);setSelected([]);setReviewed(false);
  try{setRecord(await api<PriceResearch>('/price-research','POST',body,attempt.current!.key))}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function check(){if(!attempt.current)return;setBusy(true);setError('');try{setRecord(await api<PriceResearch>('/price-research/'+attempt.current.key))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function choose(quote:MaterialQuote,checked:boolean){setSelected(previous=>checked?[...previous.filter(id=>quotes.find(q=>q.id===id)?.category!==quote.category),quote.id]:previous.filter(id=>id!==quote.id));changed()}
 async function apply(){if(!record||!valid||!reviewed)return;setApplying(true);setError('');
  const basis:PricingBasis={research_id:record.id,quote_ids:selected,waste_percent:waste,labor_rate_low:laborLow,labor_rate_high:laborHigh,reviewed:true};
  try{const proposal=await api<PriceProposal>('/price-research/proposal','POST',basis);onApply(proposal);onOpenChange(false)}catch(e){setError((e as Error).message)}finally{setApplying(false)}
 }
 const source=(url:string)=>{try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?url:undefined}catch{return undefined}};
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="price-research-dialog">
  <DialogHeader><DialogTitle>Material price research</DialogTitle><DialogDescription>Find supplier offers, review their sources, then compose your installed rate.</DialogDescription></DialogHeader>
  <div className="price-research-body">
   {!isLoading&&!ready&&<Alert><AlertTitle>Connect AI to search supplier prices</AlertTitle><AlertDescription>Sign in through SatelliteRoofs Settings, select a model, and complete the connection test. Live research also needs web search access.</AlertDescription><Button variant="outline" size="sm" onClick={()=>{onOpenChange(false);onSettings()}}>Open AI settings</Button></Alert>}
   {latest&&record?.id!==latest.id&&<Button className="research-resume" variant="ghost" size="sm" disabled={busy} onClick={()=>{locationEdited.current=true;setRecord(latest);setQuery(latest.request.query);setLocation(latest.request.location);setSelected([]);setReviewed(false);setError('');attempt.current={key:latest.id,payload:JSON.stringify(latest.request)}}}>Load last research ({latest.status})</Button>}
   <form onSubmit={e=>{e.preventDefault();void research(!!record)}}><FieldGroup><Field><FieldLabel htmlFor="material-search">Materials to research</FieldLabel><Input id="material-search" aria-label="Materials to research" value={query} maxLength={350} disabled={busy} onChange={e=>setQuery(e.target.value)}/></Field><Field><FieldLabel htmlFor="material-location">City, state or ZIP (optional)</FieldLabel><Input id="material-location" aria-label="Material price location" value={location} maxLength={100} disabled={busy} placeholder="Chicago, IL" onChange={e=>{locationEdited.current=true;setLocation(e.target.value)}}/></Field></FieldGroup><div className="research-start"><span>Only this description and location go to AI search. Provider usage applies.</span><Button type="submit" disabled={!ready||busy||query.trim().length<3}>{busy?<Loader2 className="spin"/>:<Search/>}{busy?'Researching…':record?'Research again':'Research prices'}</Button></div></form>
   {busy&&<p role="status" className="research-status">Researching supplier pages. You can close this panel and return while it finishes.</p>}
   {error&&<Alert variant="destructive"><AlertTitle>Research unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
   {(record?.status==='unknown'||record?.status==='running'||record?.status==='failed'||(error&&attempt.current))&&<div className="research-recovery"><p>{record?.message||'Check this request before starting another search. An interrupted provider request may still use your allowance.'}</p><Button variant="outline" size="sm" disabled={busy} onClick={check}>Check request status</Button><Button variant="ghost" size="sm" disabled={busy||!ready} onClick={()=>research(true)}>Start a new search</Button></div>}
   {record?.status==='completed'&&<>
    <div className="research-results-heading"><h3>Supplier offers</h3><span>Checked {record.checked_at?new Date(record.checked_at).toLocaleString():'just now'}</span></div>
    <p className="research-context">Results for {record.request.query}{record.request.location?` · ${record.request.location}`:''}. AI-extracted prices need review at the supplier. Select one offer per category. Tax, delivery and local stock may differ.</p>
    {!quotes.length&&<p className="research-status">No comparable visible prices were found. Try a specific brand or supplier product.</p>}
    <div className="material-offers">{quotes.map(q=><article key={q.id} className="material-offer" data-selected={selected.includes(q.id)}>
     <div className="material-offer-title"><input type="checkbox" aria-label={`Select ${q.product}`} disabled={!q.coverage_ft2} checked={selected.includes(q.id)} onChange={e=>choose(q,e.target.checked)}/><div><strong>{q.product}</strong><span>{q.supplier} · {q.category.replaceAll('_',' ')}</span></div><strong>{usd(q.price_usd)}<small>/ {q.unit}</small></strong></div>
     <div className="material-offer-meta"><span>{q.coverage_ft2?`${Number(q.coverage_ft2).toLocaleString()} ft² / ${q.unit} · ${usd(String(Number(q.price_usd)/Number(q.coverage_ft2)))} / ft²`:'Pack coverage unavailable; cannot apply as an area rate.'}</span><a href={source(q.source_url)} target="_blank" rel="noopener noreferrer">Supplier page <ExternalLink/></a>{q.coverage_source_url&&q.coverage_source_url!==q.source_url&&<a href={source(q.coverage_source_url)} target="_blank" rel="noopener noreferrer">Coverage source <ExternalLink/></a>}</div>
     <p>{q.availability}</p>
    </article>)}</div>
    {record.notes.length>0&&<details className="research-notes"><summary>Research notes</summary>{record.notes.map((note,index)=><p key={index}>{note}</p>)}</details>}
    {chosen.length>0&&<section className="material-rate-composer"><h3>Compose the installed rate</h3><p>Selected material cost plus waste, without whole-pack rounding. Add your labor and all remaining costs below.</p><FieldGroup><Field><FieldLabel htmlFor="material-waste">Material waste (%)</FieldLabel><Input id="material-waste" aria-label="Material waste (%)" type="number" min={0} max={30} value={waste} onChange={e=>{setWaste(e.target.value);changed()}}/></Field><Field><FieldLabel htmlFor="material-labor-low">Lower labor + other ($/ft²)</FieldLabel><Input id="material-labor-low" aria-label="Lower labor and other rate" type="number" min={0} max={100} step="any" value={laborLow} onChange={e=>{setLaborLow(e.target.value);changed()}}/></Field><Field><FieldLabel htmlFor="material-labor-high">Upper labor + other ($/ft²)</FieldLabel><Input id="material-labor-high" aria-label="Upper labor and other rate" type="number" min={0} max={100} step="any" value={laborHigh} onChange={e=>{setLaborHigh(e.target.value);changed()}}/></Field></FieldGroup><div className="material-rate-summary"><span>Selected materials {Number.isFinite(material)?usd(String(material)):'—'} / ft²</span><strong>{valid?`${usd(String(material+Number(laborLow)))}–${usd(String(material+Number(laborHigh)))}`:'Enter labor and other rates'}<small> / surface ft²</small></strong></div><label className="research-review"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the supplier prices, pack coverage, waste, and labor assumptions.</label></section>}
   </>}
  </div>
  <DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Close</Button><Button disabled={!reviewed||!valid||applying||busy} onClick={apply}><Sparkles/>{applying?'Applying…':'Apply selected prices'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
