"use client"
import { ChevronsUpDown, Settings2, ShieldCheck } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
export function NavUser({onSettings}:{onSettings:()=>void}) {
  return <SidebarMenu><SidebarMenuItem><DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuButton size="lg">
    <Avatar className="size-8"><AvatarFallback>LO</AvatarFallback></Avatar><span className="flex flex-1 flex-col text-left"><span>Local owner</span><span className="text-xs text-muted-foreground">Local workspace</span></span><ChevronsUpDown/>
  </SidebarMenuButton></DropdownMenuTrigger><DropdownMenuContent side="right" align="end"><DropdownMenuLabel>SatelliteRoofs installation</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuItem onClick={onSettings}><Settings2/>Workspace settings</DropdownMenuItem><DropdownMenuItem disabled><ShieldCheck/>Single owner · local data</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></SidebarMenuItem></SidebarMenu>
}
