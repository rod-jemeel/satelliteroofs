"use client"
import Image from "next/image"
import { ChevronsUpDown, Settings2, Check } from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
export function RoofWordmark(){return <span className="roof-wordmark"><Image src="/satelliteroofs-logo.png" alt="SatelliteRoofs" width={2172} height={724} priority /></span>}
export function TeamSwitcher({onSettings}:{onSettings:()=>void}) {
 return <SidebarMenu><SidebarMenuItem><DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuButton size="lg"><span className="flex flex-1 flex-col text-left"><RoofWordmark/><span className="text-xs text-muted-foreground">Local workspace</span></span><ChevronsUpDown/></SidebarMenuButton></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuLabel>Current workspace</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuItem disabled><Check/>Local workspace</DropdownMenuItem><DropdownMenuItem onClick={onSettings}><Settings2/>Workspace settings</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></SidebarMenuItem></SidebarMenu>
}
