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
      <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-secondary text-secondary-foreground font-bold border border-border">
        ADMIN
      </span>
    );
  }
  return (
    <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-muted text-muted-foreground font-bold">
      USER
    </span>
  );
}

function SidebarNav({
  navItems,
  location,
  isOwner,
}: {
  navItems: NavItem[];
  location: string;
  isOwner: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu className="p-2">
      {navItems.map((item) => {
        const isActive = location === item.path;
        const Icon = item.icon;

        return (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              onClick={() => {
                // ✅ fecha o drawer no mobile quando navegar
                if (isMobile) setOpenMobile(false);
              }}
              className={[
                "h-11 border-2 border-transparent",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-primary"
                  : "hover:border-sidebar-border hover:bg-sidebar-accent text-sidebar-foreground",
                item.ownerOnly ? "font-semibold text-primary" : "",
              ].join(" ")}
            >
              <Link href={item.path}>
                <a className="flex items-center gap-3">
                  <Icon className={["w-5 h-5", item.ownerOnly ? "text-primary" : ""].join(" ")} />
                  <span className="font-medium">{item.label}</span>
                  {item.ownerOnly ? (
                    <Crown className="w-3 h-3 ml-auto text-primary" />
                  ) : null}
                </a>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { logout, userData, isOwner, isAdmin } = useAuth();
  const [location] = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logout realizado com sucesso");
      window.location.href = "/login";
    } catch {
      toast.error("Erro ao fazer logout");
    }
  };

  // Itens base para admins/owner
  const baseNavItems: NavItem[] = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/users", icon: Users, label: "Usuários" },
    { path: "/groups", icon: UsersRound, label: "Grupos" },
    { path: "/notifications", icon: Bell, label: "Notificações" },
    { path: "/schedule", icon: Calendar, label: "Agendamentos" },
    { path: "/history", icon: Clock, label: "Histórico" },
    { path: "/logs", icon: FileText, label: "Logs" },
  ];

  // Owner-only
  const ownerNavItems: NavItem[] = [
    { path: "/subscription", icon: ShieldCheck, label: "Assinaturas", ownerOnly: true },
    { path: "/superadmin", icon: ShieldAlert, label: "Área do Dono", ownerOnly: true },
  ];

  const navItems = isOwner ? [...baseNavItems, ...ownerNavItems] : baseNavItems;

  return (
    <SidebarProvider defaultOpen={true} className="w-full">
      {/* ✅ Sidebar com drawer no mobile */}
      <Sidebar className="bg-sidebar border-sidebar-border">
        <SidebarHeader className="border-b-2 border-sidebar-border p-4">
          <div className="px-2 py-2">
            <h1 className="text-xl font-bold text-sidebar-foreground mono">
              NOTIFIQUE-ME
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isOwner ? "Super Admin Panel" : "Admin Panel"}
            </p>
            <RoleBadge isOwner={isOwner} isAdmin={isAdmin} />
          </div>
        </SidebarHeader>

        <SidebarContent className="p-2">
          <SidebarNav navItems={navItems} location={location} isOwner={isOwner} />
        </SidebarContent>

        <SidebarFooter className="border-t-2 border-sidebar-border p-4">
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-sidebar-foreground mono">
              {userData?.name || "Usuário"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {userData?.email || ""}
            </p>
            <p className="text-xs text-primary font-bold uppercase mt-1">
              {userData?.role || "user"}
            </p>
          </div>

          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full justify-start gap-3 border-2 border-sidebar-border hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </SidebarFooter>
      </Sidebar>

      {/* ✅ Conteúdo com topbar mobile */}
      <SidebarInset className="min-h-screen w-full overflow-x-hidden">
        {/* Topbar (mobile) */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/80 backdrop-blur p-3 md:hidden">
          <SidebarTrigger />
          <div className="flex-1">
            <div className="text-sm font-bold">NOTIFIQUE-ME</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {userData?.email || ""}
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="border-2 border-border"
          >
            Sair
          </Button>
        </div>

        {/* Área principal */}
        <main className="w-full flex-1 overflow-x-hidden p-3 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
