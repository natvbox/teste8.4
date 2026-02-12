// Users management page
// Design: Brutalismo Digital - tabela de dados densa com ações diretas

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Edit, Plus, Trash2, UserCheck, UserX, Crown, Shield, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Users() {
  const { isOwner } = useAuth();
  const utils = trpc.useUtils();
  
  // Buscar usuários - Owner vê todos, Admin vê do seu tenant
  const { data: users, isLoading } = isOwner 
    ? trpc.superadmin.listAllUsers.useQuery()
    : trpc.tenant.listMyUsers.useQuery();
  
  // Buscar tenants para o select (apenas Owner)
  const { data: tenants } = trpc.superadmin.listTenants.useQuery(undefined, {
    enabled: isOwner,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    loginId: "",
    password: "",
    email: "",
    role: "user" as "user" | "admin",
    tenantId: 0,
  });

  // Mutations
  const createAdmin = trpc.superadmin.createAdmin.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso");
      utils.superadmin.listAllUsers.invalidate();
      utils.tenant.listMyUsers.invalidate();
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar usuário");
    },
  });

  const updateAdmin = trpc.superadmin.updateAdmin.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso");
      utils.superadmin.listAllUsers.invalidate();
      utils.tenant.listMyUsers.invalidate();
      setEditingUser(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar usuário");
    },
  });

  const deleteAdmin = trpc.superadmin.deleteAdmin.useMutation({
    onSuccess: () => {
      toast.success("Usuário rebaixado para user");
      utils.superadmin.listAllUsers.invalidate();
      utils.tenant.listMyUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao remover admin");
    },
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tenantId && isOwner) {
      toast.error("Selecione um tenant para o usuário");
      return;
    }

    createAdmin.mutate({
      name: formData.name,
      tenantId: formData.tenantId,
      loginId: formData.loginId,
      password: formData.password,
      email: formData.email || undefined,
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    updateAdmin.mutate({
      id: editingUser.id,
      name: formData.name,
      role: formData.role,
      tenantId: formData.tenantId || undefined,
    });
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm("Tem certeza que deseja rebaixar este usuário para 'user'?")) return;
    deleteAdmin.mutate(userId);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      loginId: "",
      password: "",
      email: "",
      role: "user",
      tenantId: 0,
    });
  };

  const openEditDialog = (user: any) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      loginId: user.openId || "",
      password: "",
      email: user.email || "",
      role: user.role || "user",
      tenantId: user.tenantId || 0,
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-primary" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-chart-2" />;
      default:
        return <UserIcon className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-primary text-primary-foreground">OWNER</Badge>;
      case 'admin':
        return <Badge className="bg-chart-2 text-white">ADMIN</Badge>;
      default:
        return <Badge variant="outline">USER</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mono mb-2">
              USUÁRIOS
            </h1>
            <div className="h-1 w-32 bg-primary"></div>
            <p className="text-muted-foreground mt-2">
              {isOwner ? "Todos os usuários do sistema" : "Usuários do seu tenant"}
            </p>
          </div>

          {isOwner && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 gap-2">
                  <Plus className="w-4 h-4" />
                  Novo Admin
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-2 border-border">
                <DialogHeader>
                  <DialogTitle className="text-2xl mono">CRIAR ADMIN</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                      className="border-2"
                      placeholder="Nome do administrador"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Usuário (login)</Label>
                    <Input
                      value={formData.loginId}
                      onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                      required
                      className="border-2"
                      placeholder="usuario;56dt68"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pode conter letras, números e ; . _ -
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      className="border-2"
                      placeholder="7h57d7"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Email (opcional)</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="border-2"
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tenant (Cliente)</Label>
                    <Select
                      value={formData.tenantId.toString()}
                      onValueChange={(value) =>
                        setFormData({ ...formData, tenantId: parseInt(value) })
                      }
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue placeholder="Selecione um tenant" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants?.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id.toString()}>
                            {tenant.name} ({tenant.slug})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90"
                    disabled={createAdmin.isPending}
                  >
                    {createAdmin.isPending ? "CRIANDO..." : "CRIAR ADMIN"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Users Table */}
        <div className="brutalist-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary border-b-2 border-border">
                <tr>
                  <th className="text-left p-4 font-bold mono text-sm">ROLE</th>
                  <th className="text-left p-4 font-bold mono text-sm">NOME</th>
                  <th className="text-left p-4 font-bold mono text-sm">EMAIL</th>
                  {isOwner && <th className="text-left p-4 font-bold mono text-sm">TENANT</th>}
                  <th className="text-left p-4 font-bold mono text-sm">ÚLTIMO ACESSO</th>
                  {isOwner && <th className="text-right p-4 font-bold mono text-sm">AÇÕES</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={isOwner ? 6 : 4} className="text-center p-8 text-muted-foreground">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : !users || users.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 6 : 4} className="text-center p-8 text-muted-foreground">
                      Nenhum usuário cadastrado
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-secondary/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(user.role)}
                          {getRoleBadge(user.role)}
                        </div>
                      </td>
                      <td className="p-4 font-medium">{user.name || "Sem nome"}</td>
                      <td className="p-4 mono text-sm text-muted-foreground">
                        {user.email || user.openId}
                      </td>
                      {isOwner && (
                        <td className="p-4 text-sm">
                          {user.tenantId ? (
                            <Badge variant="outline">ID: {user.tenantId}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      )}
                      <td className="p-4 text-sm text-muted-foreground">
                        {user.lastSignedIn 
                          ? new Date(user.lastSignedIn).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "N/A"}
                      </td>
                      {isOwner && (
                        <td className="p-4">
                          <div className="flex items-center justify-end gap-2">
                            {user.role !== 'owner' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditDialog(user)}
                                  className="border-2"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {user.role === 'admin' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="border-2 text-destructive hover:bg-destructive/10"
                                  >
                                    <UserX className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="bg-card border-2 border-border">
            <DialogHeader>
              <DialogTitle className="text-2xl mono">EDITAR USUÁRIO</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="border-2"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: "user" | "admin") =>
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger className="border-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isOwner && (
                <div className="space-y-2">
                  <Label>Tenant</Label>
                  <Select
                    value={formData.tenantId?.toString() || "0"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, tenantId: parseInt(value) || 0 })
                    }
                  >
                    <SelectTrigger className="border-2">
                      <SelectValue placeholder="Selecione um tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Nenhum (Sistema)</SelectItem>
                      {tenants?.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id.toString()}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90"
                disabled={updateAdmin.isPending}
              >
                {updateAdmin.isPending ? "SALVANDO..." : "SALVAR"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Info */}
        <div className="mt-6 p-4 bg-secondary border-2 border-border">
          <p className="text-sm text-muted-foreground">
            <strong>Roles:</strong> 
            <span className="ml-2"><Crown className="w-3 h-3 inline" /> Owner = Super Admin do sistema</span>
            <span className="ml-2"><Shield className="w-3 h-3 inline" /> Admin = Administrador de um tenant</span>
            <span className="ml-2"><UserIcon className="w-3 h-3 inline" /> User = Usuário comum</span>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
