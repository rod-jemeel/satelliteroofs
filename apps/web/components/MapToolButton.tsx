'use client';
import type {ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {Tooltip,TooltipContent,TooltipTrigger} from '@/components/ui/tooltip';

export default function MapToolButton({label,disabled,onClick,children}:{label:string;disabled?:boolean;onClick:()=>void;children:ReactNode}){
 return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent side="left">{label}</TooltipContent></Tooltip>;
}
