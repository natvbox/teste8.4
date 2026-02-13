import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  LogOut,
  Users,
  UsersRound,
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  Crown,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { toast } from "sonner";

// ✅ Usa o sidebar profissional (com drawer mobile)
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  path: string;
  icon: any;
  label: string;
  ownerOnly?: boolean;
};

function RoleBadge({ isOwner, isAdmin }: { isOwner: boolean; isAdmin: boolean }) {
  if (isOwner) {
    return (
      <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground font-bold">
        <Crown className="w-3 h-3" /> OWNER
      </span>
    );
  }
  if (isAdmin) {
    return (
      <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-xs bg-secondary text-secondary-foreground font-bold">
        <ShieldCheck className="w-3 h-3" /> ADMIN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-xs bg-muted text-muted-foreground font-bold">
      <ShieldAlert className="w-3 h-3" /> USER
    </span>
  );
}

function SidebarNav() {
  const { userData, isOwner, isAdmin, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { setOpenMobile } = useSidebar();

  const navItems: NavItem[] = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/notifications", icon: Bell, label: "Mensagens" },
    { path: "/schedule", icon: Calendar, label: "Agendamentos" },
    { path: "/users", icon: Users, label: "Usuários" },
    { path: "/groups", icon: UsersRound, label: "Grupos" },
    { path: "/logs", icon: FileText, label: "Logs", ownerOnly: true },
    { path: "/tenants", icon: Clock, label: "Tenants", ownerOnly: true },
  ];

  const visible = navItems.filter((i) => (i.ownerOnly ? isOwner : true));

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate">{userData?.appId ?? "notifique-me"}</div>
            <div className="text-xs text-muted-foreground truncate">{userData?.loginId ?? ""}</div>
            <RoleBadge isOwner={isOwner} isAdmin={isAdmin} />
          </div>

          <div className="sm:hidden">
            <SidebarTrigger />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {visible.map((item) => {
            const Icon = item.icon;
            const active = location === item.path;

            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={active}>
                  <Link
                    href={item.path}
                    onClick={() => {
                      // fecha drawer no mobile ao navegar
                      setOpenMobile?.(false);
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={async () => {
            try {
              await logout();
              toast.success("Sessão encerrada");
              setLocation("/login");
            } catch (e: any) {
              toast.error(e?.message ?? "Erro ao sair");
            }
          }}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <div className="min-h-screen bg-background">
          <div className="p-0 sm:p-0">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
