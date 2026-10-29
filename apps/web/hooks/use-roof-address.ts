'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/api';
import type {BuildingSelection} from '@/lib/buildings';

export type RoofAddress={label:string;price_location:string;accuracy:string;distance_m:number|null;storage_basis:'temporary'|'permanent_geocoding'|'user_supplied';confirmed:boolean};
export default function useRoofAddress(building:BuildingSelection,drawing:boolean,enabled:boolean,initial?:RoofAddress){
 const [property,setProperty]=useState<RoofAddress>(initial||{label:'',price_location:'',accuracy:'unknown',distance_m:null,storage_basis:'user_supplied',confirmed:false});
 const [matches,setMatches]=useState<RoofAddress[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const request=useRef(0),anchor=useRef<{longitude:number;latitude:number}|undefined>(initial?{longitude:building.longitude,latitude:building.latitude}:undefined),lastRetry=useRef(0);
 const position=useRef(building);position.current=building;
 useEffect(()=>{
  if(drawing||!enabled){setBusy(false);return;}
  const b=position.current;
  if(!Number.isFinite(b.longitude)||!Number.isFinite(b.latitude))return;
  if(anchor.current&&lastRetry.current===retry&&Math.hypot((b.longitude-anchor.current.longitude)*Math.cos(b.latitude*Math.PI/180),b.latitude-anchor.current.latitude)*111195<35)return;
  const id=++request.current;lastRetry.current=retry;
  setBusy(true);setError('');setProperty(p=>({...p,label:'',price_location:'',confirmed:false}));setMatches([]);
  const timer=setTimeout(async()=>{
   try{
    const found=await api<RoofAddress[]>('/map/reverse','POST',{longitude:b.longitude,latitude:b.latitude});
    if(id!==request.current)return;
    anchor.current={longitude:b.longitude,latitude:b.latitude};setMatches(found);
    setProperty(found[0]||{label:'',price_location:'',accuracy:'unknown',distance_m:null,storage_basis:'user_supplied',confirmed:false});
    if(!found.length)setError('No nearby street address found. Enter the address manually.');
   }catch(e){if(id===request.current)setError((e as Error).message)}finally{if(id===request.current)setBusy(false)}
  },500);
  return()=>{clearTimeout(timer);request.current++};
 },[building.key,drawing,enabled,retry,initial]);
 function edit(label:string){request.current++;setBusy(false);setError('');setProperty({label,price_location:'',accuracy:'user_entered',distance_m:null,storage_basis:'user_supplied',confirmed:false})}
 return {property,setProperty,matches,busy,error,edit,refresh:()=>setRetry(n=>n+1)};
}
