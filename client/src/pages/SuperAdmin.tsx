import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Building2, 
  Bell, 
  Plus, 
  Trash2, 
  Calendar, 
  ShieldAlert,
  RefreshCw,
  Crown,
  AlertCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SuperAdmin() {
  const { isOwner, userData, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  // Redirecionar se não for owner
  useEffect(() => {
    if (!loading && !isOwner) {
      toast.error("Acesso negado. Apenas o Owner pode acessar esta página.");
      setLocation("/dashboard");
    }
  }, [isOwner, loading, setLocation]);
  
  const { data: stats } = trpc.superadmin.getStats.useQuery(undefined, {
    enabled: isOwner,
  });
  const { data: tenants, isLoading } = trpc.superadmin.listTenants.useQuery(undefined, {
    enabled: isOwner,
  });
  
  const createTenant = trpc.superadmin.createTenant.useMutation({
    onSuccess: () => {
      toast.success("Cliente cadastrado com sucesso!");
      utils.superadmin.listTenants.invalidate();
      utils.superadmin.getStats.invalidate();
      setIsCreateOpen(false);
      setNewTenant({ name: "", slug: "", plan: "basic", months: 1 });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar cliente");
    }
  });

  const deleteTenant = trpc.superadmin.deleteTenant.useMutation({
    onSuccess: () => {
      toast.success("Cliente removido.");
      utils.superadmin.listTenants.invalidate();
      utils.superadmin.getStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao remover cliente");
    }
  });

  const renewSubscription = trpc.tenant.renewSubscription.useMutation({
    onSuccess: (data) => {
      toast.success(`Assinatura renovada até ${new Date(data.newExpiry).toLocaleDateString('pt-BR')}`);
      utils.superadmin.listTenants.invalidate();
      setIsRenewOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao renovar: " + error.message);
    }
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [renewMonths, setRenewMonths] = useState(1);
  
  const [newTenant, setNewTenant] = useState({
    name: "",
    slug: "",
    plan: "basic" as "basic" | "pro" | "enterprise",
    months: 1
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate({
      name: newTenant.name,
      slug: newTenant.slug,
      plan: newTenant.plan,
      months: newTenant.months
    });
  };

  const handleRenew = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTenantId) {
      renewSubscription.mutate({
        tenantId: selectedTenantId,
        months: renewMonths
      });
    }
  };

  // Se ainda está carregando ou não é owner, não renderizar
  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center justify-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!isOwner) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="brutalist-card p-8 text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-destructive mb-2">Acesso Negado</h1>
            <p className="text-muted-foreground">
              Esta página é exclusiva para o Owner do sistema.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Seu role atual: <strong>{userData?.role || 'desconhecido'}</strong>
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mono mb-2 flex items-center gap-3">
              <Crown className="w-10 h-10 text-primary" />
              ÁREA DO DONO
            </h1>
            <div className="h-1 w-32 bg-primary"></div>
            <p className="text-muted-foreground mt-2">
              Gerencie todos os clientes e licenças do sistema.
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-4 border-border">
              <DialogHeader>
                <DialogTitle className="text-2xl mono">CADASTRAR NOVO CLIENTE</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input 
                    value={newTenant.name}
                    onChange={e => setNewTenant({...newTenant, name: e.target.value})}
                    placeholder="Ex: Academia Fit"
                    required
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (Identificador único)</Label>
                  <Input 
                    value={newTenant.slug}
                    onChange={e => setNewTenant({...newTenant, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                    placeholder="ex: academia-fit"
                    required
                    className="border-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Será usado como identificador único. Use apenas letras minúsculas e hífens.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plano</Label>
                    <Select 
                      value={newTenant.plan}
                      onValueChange={(v: any) => setNewTenant({...newTenant, plan: v})}
                    >
                      <SelectTrigger className="border-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Meses de Licença</Label>
                    <Input 
                      type="number"
                      value={newTenant.months}
                      onChange={e => setNewTenant({...newTenant, months: parseInt(e.target.value) || 1})}
                      min={1}
                      required
                      className="border-2"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-primary" disabled={createTenant.isPending}>
                  {createTenant.isPending ? "CADASTRANDO..." : "CRIAR LICENÇA"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-4 border-border brutalist-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold uppercase">Total de Clientes</CardTitle>
              <Building2 className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mono">{stats?.totalTenants || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-4 border-border brutalist-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold uppercase">Usuários Totais</CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mono">{stats?.totalUsers || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-4 border-border brutalist-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold uppercase">Notificações Enviadas</CardTitle>
              <Bell className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mono">{stats?.totalNotifications || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tenants List */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold uppercase flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" /> Gerenciamento de Licenças
          </h2>
          
          {isLoading ? (
            <div className="p-12 text-center animate-pulse">Carregando clientes...</div>
          ) : tenants?.length === 0 ? (
            <div className="p-12 border-4 border-dashed border-border text-center text-muted-foreground">
              Nenhum cliente cadastrado ainda. Clique em "Novo Cliente" para começar.
            </div>
          ) : (
            <div className="grid gap-4">
              {tenants?.map(tenant => (
                <div key={tenant.id} className="brutalist-card p-6 bg-card border-4 border-border flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-secondary border-2 border-border">
                      <Building2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold uppercase">{tenant.name}</h3>
                      <p className="text-sm text-muted-foreground mono">slug: {tenant.slug}</p>
                      <div className="flex gap-3 mt-2 flex-wrap">
                        <Badge className={`uppercase ${
                          tenant.plan === 'enterprise' ? 'bg-purple-500' :
                          tenant.plan === 'pro' ? 'bg-blue-500' : ''
                        }`}>
                          {tenant.plan}
                        </Badge>
                        <Badge variant={tenant.status === 'active' ? 'default' : 'destructive'} className="uppercase">
                          {tenant.status}
                        </Badge>
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" /> 
                          Expira em: {tenant.subscriptionExpiresAt ? (() => {
                            try {
                              return format(new Date(tenant.subscriptionExpiresAt), "dd/MM/yyyy");
                            } catch (e) {
                              return "Data Inválida";
                            }
                          })() : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-2 gap-2"
                      onClick={() => {
                        setSelectedTenantId(tenant.id);
                        setRenewMonths(1);
                        setIsRenewOpen(true);
                      }}
                    >
                      <RefreshCw className="w-4 h-4" /> Renovar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if(confirm("Tem certeza que deseja remover este cliente? Todos os usuários serão desassociados.")) {
                          deleteTenant.mutate(tenant.id);
                        }
                      }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dialog de Renovação */}
        <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
          <DialogContent className="bg-card border-4 border-border">
            <DialogHeader>
              <DialogTitle className="text-2xl mono">RENOVAR ASSINATURA</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRenew} className="space-y-4">
              <div className="space-y-2">
                <Label>Quantos meses deseja adicionar?</Label>
                <Input 
                  type="number"
                  value={renewMonths}
                  onChange={e => setRenewMonths(parseInt(e.target.value) || 1)}
                  min={1}
                  max={36}
                  required
                  placeholder="Ex: 12"
                  className="border-2"
                />
                <p className="text-xs text-muted-foreground">
                  A nova data de vencimento será calculada a partir da data atual de expiração.
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full bg-primary" 
                disabled={renewSubscription.isPending}
              >
                {renewSubscription.isPending ? "RENOVANDO..." : "CONFIRMAR RENOVAÇÃO"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
