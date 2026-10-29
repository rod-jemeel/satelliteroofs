'use client';
import {useEffect,useRef,useState} from 'react';
import {Loader2,MapPin,Search,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {api} from '@/lib/api';

export type AddressMatch={label:string;longitude:number;latitude:number;accuracy:string;feature_type?:string};
type Suggestion={mapbox_id:string;label:string;feature_type:string};
type Proximity={longitude:number;latitude:number};
export default function MapAddressSearch({enabled,disabled,onChoose,focusRequest=0,proximity,selectedAddress}:{enabled:boolean;disabled:boolean;onChoose:(match:AddressMatch)=>void;focusRequest?:number;proximity?:Proximity;selectedAddress?:{label:string;request:number}}){
 const [address,setAddress]=useState(''),[typed,setTyped]=useState(''),[matches,setMatches]=useState<Suggestion[]>([]),[busy,setBusy]=useState<'suggest'|'retrieve'|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[active,setActive]=useState(-1);
 const request=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const session=useRef<{token:string;started:number;calls:number}|null>(null),matchesSession=useRef('');
 const input=useRef<HTMLInputElement>(null),focusedRequest=useRef(0),current=useRef({enabled,disabled,proximity});current.current={enabled,disabled,proximity};
 useEffect(()=>{if(selectedAddress){clear();session.current=null;setAddress(selectedAddress.label)}},[selectedAddress?.request]);
 useEffect(()=>{if(focusRequest>focusedRequest.current&&enabled&&!disabled){input.current?.focus();focusedRequest.current=focusRequest}},[focusRequest,enabled,disabled]);
 function clear(){clearTimeout(timer.current);request.current++;setTyped('');setMatches([]);setActive(-1);setMessage('');setError('');setBusy(null)}
 function sessionToken(){if(!session.current||Date.now()-session.current.started>170000||session.current.calls>=45)session.current={token:crypto.randomUUID(),started:Date.now(),calls:0};session.current.calls++;return session.current.token}
 async function search(value=address){
  clearTimeout(timer.current);
  if(current.current.disabled||!current.current.enabled||value.trim().length<3)return;
  const id=++request.current,token=sessionToken();setBusy('suggest');setMatches([]);setActive(-1);setError('');setMessage('');
  try{const results=await api<Suggestion[]>('/map/suggest','POST',{query:value.trim(),session_token:token,...(current.current.proximity?{proximity:current.current.proximity}:{})});if(id!==request.current)return;matchesSession.current=token;setMatches(results);if(!results.length)setMessage('No addresses found. Try adding the city or ZIP code.');}
  catch(e){if(id===request.current)setError((e as Error).message)}finally{if(id===request.current)setBusy(null)}
 }
 useEffect(()=>{if(typed.trim().length>=3&&enabled&&!disabled)timer.current=setTimeout(()=>void search(typed),400);return()=>clearTimeout(timer.current)},[typed,enabled,disabled]);
 useEffect(()=>{if(disabled){clear();session.current=null}},[disabled]);
 useEffect(()=>()=>{request.current++;clearTimeout(timer.current)},[]);
 async function choose(match:Suggestion){
  clearTimeout(timer.current);const id=++request.current,token=matchesSession.current;setBusy('retrieve');setError('');session.current=null;
  try{const result=await api<AddressMatch>('/map/retrieve','POST',{mapbox_id:match.mapbox_id,session_token:token});if(id!==request.current)return;setTyped('');setAddress(result.label);setMatches([]);setActive(-1);setMessage('');onChoose(result)}catch(e){if(id===request.current)setError((e as Error).message)}finally{if(id===request.current)setBusy(null)}
 }
 return <div className="map-address-search">
  <form role="search" aria-label="Find a house on the map" onSubmit={e=>{e.preventDefault();if(busy!=='retrieve')void search()}}>
   <Input ref={input} role="combobox" aria-autocomplete="list" aria-expanded={matches.length>0&&!disabled} aria-controls="map-address-options" aria-activedescendant={active>=0?`map-address-option-${active}`:undefined} aria-label="Search map by address" placeholder={enabled?'Search an address or place':'Connect Mapbox to search addresses'} value={address} maxLength={256} autoComplete="off" disabled={!enabled||disabled||busy==='retrieve'} onChange={e=>{clear();setAddress(e.target.value);setTyped(e.target.value);if(!e.target.value.trim())session.current=null}} onKeyDown={e=>{if(e.key==='Escape'){clear();session.current=null}if(e.key==='ArrowDown'&&matches.length){e.preventDefault();setActive(n=>Math.min(n+1,matches.length-1))}if(e.key==='ArrowUp'&&matches.length){e.preventDefault();setActive(n=>Math.max(n-1,0))}if(e.key==='Enter'&&active>=0&&matches[active]){e.preventDefault();void choose(matches[active])}}}/>
   <Button variant="ghost" size="icon" type="submit" aria-label="Search address" disabled={!enabled||disabled||!!busy||address.trim().length<3}>{busy?<Loader2 className="spin"/>:<Search/>}</Button>
  </form>
  {!disabled&&matches.length>0&&<div className="map-address-matches"><div className="map-address-results-title"><span>Mapbox suggestions</span><Button variant="ghost" size="icon" aria-label="Close address matches" onClick={clear}><X/></Button></div><ul id="map-address-options" role="listbox" aria-label="Address matches">{matches.map((match,index)=><li key={match.mapbox_id} role="presentation"><Button role="option" id={`map-address-option-${index}`} aria-selected={active===index} tabIndex={-1} variant={active===index?'secondary':'ghost'} aria-label={`Go to ${match.label}`} disabled={busy==='retrieve'} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>void choose(match)}><MapPin/><span>{match.label}<small>{match.feature_type.replaceAll('_',' ')} · check the location on the map</small></span></Button></li>)}</ul><p><a href="https://www.mapbox.com/search" target="_blank" rel="noopener noreferrer">Search by Mapbox</a></p></div>}
  {!disabled&&message&&<p className="map-address-message" role="status">{message}</p>}
  {!disabled&&error&&<p className="map-address-message map-address-error" role="alert">{error}</p>}
 </div>;
}
