"use client";

import { Bell, Settings, ChevronLeft, ChevronRight, LayoutDashboard, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useProfile } from "@/hooks/useProfile";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const TABS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Trends", href: "/trends", icon: TrendingUp },
];

export default function SideBar() {
  const { state, toggleSidebar } = useSidebar();
  const isOpen = state === "expanded";
  const { data: user } = useProfile();

  return (
    <Sidebar collapsible="icon" className="pt-7 !top-7 !h-[calc(100vh-1.75rem)]">
      <div className="flex items-center justify-end px-2 py-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="flex items-center justify-center h-6 w-6 rounded-md text-dim hover:text-foreground hover:bg-raised transition-colors"
        >
          {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span className="t-ui group-data-[collapsible=icon]:hidden">Tabs</span>
          </SidebarGroupLabel>

          <SidebarMenu>
            {TABS.map(({ label, href, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton tooltip={label}>
                  <Link href={href} className="flex items-center gap-2 w-full">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Separator />

        <Link href="/profile" className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Avatar className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
            <AvatarImage src={user?.avatar_url ?? "https://github.com/shadcn.png"} alt={user?.display_name ?? "User"} className="grayscale" />
            <AvatarFallback>{user?.display_name?.slice(0, 2).toUpperCase() ?? "U"}</AvatarFallback>
          </Avatar>
          <h4 className="t-h4 pl-4 group-data-[collapsible=icon]:hidden">{user?.display_name ?? "User"}</h4>
        </Link>

        <div className="flex items-center justify-between px-2 pb-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <button type="button" aria-label="Notifications" className="text-dim hover:text-foreground transition-colors">
            <Bell className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Settings" className="text-dim hover:text-foreground transition-colors">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}