import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CreditCard, ShieldCheck, AlertTriangle, Crown, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Subscription() {
  const { data: subscription, isLoading, error, refetch } = trpc.tenant.getSubscription.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: false
  });

  // Log de depuração para o console do navegador
  useEffect(() => {
    if (isLoading) console.log("[Subscription] Carregando dados...");
    if (error) console.error("[Subscription] Erro ao carregar:", error);
    if (subscription) console.log("[Subscription] Dados recebidos:", subscription);
  }, [isLoading, error, subscription]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="animate-pulse font-bold mono">CARREGANDO DETALHES DA ASSINATURA...</p>
          <p className="text-xs text-muted-foreground mt-2">Verifique o console do navegador (F12) para detalhes técnicos.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="p-6 border-4 border-destructive bg-destructive/10 text-destructive brutalist-card">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 uppercase">
              <AlertTriangle /> Erro de Conexão
            </h2>
            <p className="mb-4">{error.message || "Não foi possível conectar ao servidor para buscar sua licença."}</p>
            <Button onClick={() => refetch()} variant="outline" className="border-2 border-destructive hover:bg-destructive hover:text-white gap-2">
              <RefreshCw className="w-4 h-4" /> Tentar Novamente
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!subscription) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="p-6 border-4 border-yellow-500 bg-yellow-500/10 text-yellow-700 brutalist-card">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 uppercase">
              <ShieldCheck /> Licença Não Encontrada
            </h2>
            <p className="mb-4">Seu usuário não está vinculado a nenhuma licença (Tenant). Isso acontece se você for um usuário novo ou se o seu cadastro estiver incompleto.</p>
            <div className="p-4 bg-white/50 border-2 border-yellow-500 text-xs mono">
              DICA: Se você é o dono, acesse a "Área do Dono" e cadastre este usuário em um Cliente.
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mono mb-2 uppercase">
            {subscription.isSuperAdmin ? "Status do Sistema" : "Minha Assinatura"}
          </h1>
          <div className="h-1 w-32 bg-primary"></div>
        </div>

        {subscription.isSuperAdmin && (
          <div className="mb-8 p-4 bg-primary/10 border-2 border-primary flex items-center gap-3">
            <Crown className="w-6 h-6 text-primary" />
            <span className="font-bold uppercase">Você está logado como Administrador Global. Licença ilimitada.</span>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Status da Licença */}
          <Card className="border-4 border-border brutalist-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 uppercase">
                <ShieldCheck className="w-6 h-6 text-primary" />
                Status da Licença
              </CardTitle>
              <CardDescription>Informações sobre o seu plano atual</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-secondary border-2 border-border">
                <span className="font-bold uppercase">Plano Atual</span>
                <Badge variant="default" className="bg-primary text-primary-foreground uppercase px-4 py-1">
                  {subscription.plan}
                </Badge>
              </div>

              <div className="flex justify-between items-center p-4 bg-secondary border-2 border-border">
                <span className="font-bold uppercase">Status</span>
                <Badge 
                  variant={subscription.status === 'active' ? 'default' : 'destructive'}
                  className="uppercase px-4 py-1"
                >
                  {subscription.status === 'active' ? 'Ativo' : 'Suspenso'}
                </Badge>
              </div>

              {subscription.isExpired && (
                <div className="p-4 bg-destructive/10 border-2 border-destructive text-destructive flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6" />
                  <span className="font-bold">Sua licença expirou! Entre em contato para renovar.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detalhes de Pagamento/Vencimento */}
          <Card className="border-4 border-border brutalist-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 uppercase">
                <Calendar className="w-6 h-6 text-primary" />
                Vencimento
              </CardTitle>
              <CardDescription>Controle de validade da sua licença</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-6 bg-secondary border-2 border-border text-center">
                <p className="text-sm text-muted-foreground uppercase mb-1">Válido até</p>
                <p className="text-3xl font-bold mono">
                  {subscription.subscriptionExpiresAt 
                    ? format(new Date(subscription.subscriptionExpiresAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : "Vitalício / Ilimitado"}
                </p>
              </div>

              <div className="p-4 border-2 border-dashed border-border text-center">
                <p className="text-sm font-bold uppercase">
                  {subscription.isSuperAdmin 
                    ? "Acesso Total Garantido" 
                    : subscription.daysRemaining > 0 
                      ? `Restam ${subscription.daysRemaining} dias de uso`
                      : "Licença expirada"}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                <CreditCard className="w-4 h-4" />
                <span>Para renovar ou alterar seu plano, fale com o suporte técnico.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
