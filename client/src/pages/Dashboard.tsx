// Main dashboard page with statistics
// Design: Brutalismo Digital - grid 3-colunas com cards de estatísticas

import DashboardLayout from "@/components/DashboardLayout";
import { Bell, CheckCircle2, Clock, Users, Building2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { userData, isOwner } = useAuth();
  
  // Buscar estatísticas do servidor
  const { data: tenantStats } = trpc.tenant.getStats.useQuery();
  const { data: subscription } = trpc.tenant.getSubscription.useQuery();
  
  // Se for owner, buscar estatísticas globais
  const { data: superAdminStats } = trpc.superadmin.getStats.useQuery(undefined, {
    enabled: isOwner,
  });

  // Estatísticas para exibir
  const stats = isOwner ? {
    totalUsers: superAdminStats?.totalUsers || 0,
    totalTenants: superAdminStats?.totalTenants || 0,
    totalNotifications: superAdminStats?.totalNotifications || 0,
  } : {
    totalUsers: tenantStats?.users || 0,
    totalTenants: 1,
    totalNotifications: tenantStats?.notifications || 0,
  };

  const statCards = isOwner ? [
    {
      title: "Total de Clientes",
      value: stats.totalTenants,
      subtitle: "Tenants ativos",
      icon: Building2,
      color: "text-chart-1",
    },
    {
      title: "Total de Usuários",
      value: stats.totalUsers,
      subtitle: "Em todos os tenants",
      icon: Users,
      color: "text-chart-2",
    },
    {
      title: "Notificações Enviadas",
      value: stats.totalNotifications,
      subtitle: "Total no sistema",
      icon: Bell,
      color: "text-primary",
    },
    {
      title: "Seu Papel",
      value: "OWNER",
      subtitle: "Super Administrador",
      icon: ShieldCheck,
      color: "text-chart-3",
    },
  ] : [
    {
      title: "Usuários do Tenant",
      value: stats.totalUsers,
      subtitle: "Usuários ativos",
      icon: Users,
      color: "text-chart-2",
    },
    {
      title: "Notificações Enviadas",
      value: stats.totalNotifications,
      subtitle: "Total enviadas",
      icon: Bell,
      color: "text-primary",
    },
    {
      title: "Agendamentos",
      value: 0,
      subtitle: "Pendentes de envio",
      icon: Clock,
      color: "text-chart-3",
    },
    {
      title: "Taxa de Leitura",
      value: "0%",
      subtitle: "Mensagens lidas",
      icon: CheckCircle2,
      color: "text-chart-2",
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mono mb-2">
            DASHBOARD
          </h1>
          <div className="h-1 w-32 bg-primary"></div>
          <p className="text-muted-foreground mt-4">
            {isOwner ? (
              <>Bem-vindo, <span className="text-primary font-bold">Super Admin</span>! Você tem acesso total ao sistema.</>
            ) : (
              <>Bem-vindo, <span className="text-primary font-bold">{userData?.name || 'Admin'}</span>! Tenant: {subscription?.name || 'N/A'}</>
            )}
          </p>
        </div>

        {/* Info Banner para Owner */}
        {isOwner && (
          <div className="mb-6 p-4 bg-primary/10 border-2 border-primary">
            <p className="text-sm">
              <span className="font-bold">👑 Modo Super Admin:</span> Você pode gerenciar todos os tenants, criar novos clientes e administradores.
            </p>
          </div>
        )}

        {/* Subscription Info para Admin */}
        {!isOwner && subscription && (
          <div className="mb-6 p-4 bg-secondary border-2 border-border">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-bold">Plano: <span className="text-primary uppercase">{subscription.plan}</span></p>
                <p className="text-xs text-muted-foreground">Status: {subscription.status}</p>
              </div>
              {subscription.daysRemaining !== undefined && subscription.daysRemaining < 30 && (
                <p className="text-sm text-destructive font-bold">
                  ⚠️ {subscription.daysRemaining} dias restantes
                </p>
              )}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div key={index} className="brutalist-card p-6 hover:translate-x-1 hover:translate-y-1 transition-transform duration-150">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 bg-background border-2 border-border ${card.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {card.title}
                  </p>
                  <p className="text-3xl font-bold text-foreground mono">
                    {card.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {card.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-foreground mono mb-4">
            AÇÕES RÁPIDAS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isOwner ? (
              <>
                <a href="/superadmin" className="brutalist-card p-4 hover:bg-secondary transition-colors cursor-pointer">
                  <Building2 className="w-6 h-6 mb-2 text-primary" />
                  <p className="font-bold">Gerenciar Clientes</p>
                  <p className="text-xs text-muted-foreground">Criar e administrar tenants</p>
                </a>
                <a href="/subscription" className="brutalist-card p-4 hover:bg-secondary transition-colors cursor-pointer">
                  <Clock className="w-6 h-6 mb-2 text-primary" />
                  <p className="font-bold">Assinaturas</p>
                  <p className="text-xs text-muted-foreground">Renovar e gerenciar planos</p>
                </a>
                <a href="/users" className="brutalist-card p-4 hover:bg-secondary transition-colors cursor-pointer">
                  <Users className="w-6 h-6 mb-2 text-primary" />
                  <p className="font-bold">Usuários</p>
                  <p className="text-xs text-muted-foreground">Ver todos os usuários</p>
                </a>
              </>
            ) : (
              <>
                <a href="/notifications" className="brutalist-card p-4 hover:bg-secondary transition-colors cursor-pointer">
                  <Bell className="w-6 h-6 mb-2 text-primary" />
                  <p className="font-bold">Nova Notificação</p>
                  <p className="text-xs text-muted-foreground">Enviar para seus usuários</p>
                </a>
                <a href="/users" className="brutalist-card p-4 hover:bg-secondary transition-colors cursor-pointer">
                  <Users className="w-6 h-6 mb-2 text-primary" />
                  <p className="font-bold">Gerenciar Usuários</p>
                  <p className="text-xs text-muted-foreground">Adicionar e remover</p>
                </a>
                <a href="/schedule" className="brutalist-card p-4 hover:bg-secondary transition-colors cursor-pointer">
                  <Clock className="w-6 h-6 mb-2 text-primary" />
                  <p className="font-bold">Agendar Envio</p>
                  <p className="text-xs text-muted-foreground">Programar notificações</p>
                </a>
              </>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-foreground mono mb-4">
            INFORMAÇÕES DA CONTA
          </h2>
          <div className="brutalist-card p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="font-bold">{userData?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-bold">{userData?.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Papel</p>
                <p className="font-bold uppercase text-primary">{userData?.role || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tenant ID</p>
                <p className="font-bold">{userData?.tenantId || 'Sistema'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
