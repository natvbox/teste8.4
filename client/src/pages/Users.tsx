// Users management page
// Design: Brutalismo Digital - tabela de dados densa com ações diretas

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Edit,
  Plus,
  Trash2,
  Crown,
  Shield,
  User as UserIcon,
  Users as UsersIcon,
  KeyRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Role = "user" | "admin" | "owner";

export default function Users() {
  const { isOwner } = useAuth();
  const utils = trpc.useUtils();

  const isTenantAdmin = !isOwner;

  // ===== Queries =====
  const { data: users, isLoading } = isOwner
    ? trpc.superadmin.listAllUsers.useQuery()
    : trpc.tenant.listMyUsers.useQuery();

  // Tenants (apenas Owner)
  const { data: tenants } = trpc.superadmin.listTenants.useQuery(undefined, {
    enabled: isOwner,
  });

  // Groups do tenant (apenas Admin)
  const { data: groupsList } = trpc.groups.list.useQuery(
    { limit: 200 },
    { enabled: isTenantAdmin }
  );

  // ===== UI State =====
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Modal: grupos do usuário
  const [groupsUser, setGroupsUser] = useState<any | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  // Modal: reset senha
  const [resetUser, setResetUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // ===== Form state =====
  const [formData, setFormData] = useState({
    name: "",
    loginId: "",
    password: "",
    email: "",
    role: "user" as "user" | "admin",
    tenantId: 0,
  });

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

  // ===== Mutations (Owner) =====
  const createAdmin = trpc.superadmin.createAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin criado com sucesso");
      utils.superadmin.listAllUsers.invalidate();
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message || "Erro ao criar admin"),
  });

  const updateAdmin = trpc.superadmin.updateAdmin.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso");
      utils.superadmin.listAllUsers.invalidate();
      setEditingUser(null);
      resetForm();
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar usuário"),
  });

  const deleteAdmin = trpc.superadmin.deleteAdmin.useMutation({
    onSuccess: () => {
      toast.success("Usuário rebaixado para user");
      utils.superadmin.listAllUsers.invalidate();
    },
    onError: (error) => toast.error(error.message || "Erro ao remover admin"),
  });

  // ===== Mutations (Admin Tenant) =====
  const createUser = trpc.tenant.createUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso");
      utils.tenant.listMyUsers.invalidate();
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message || "Erro ao criar usuário"),
  });

  const updateUser = trpc.tenant.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso");
      utils.tenant.listMyUsers.invalidate();
      setEditingUser(null);
      resetForm();
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar usuário"),
  });

  const deleteUser = trpc.tenant.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário removido");
      utils.tenant.listMyUsers.invalidate();
    },
    onError: (error) => toast.error(error.message || "Erro ao remover usuário"),
  });

  const resetUserPassword = trpc.tenant.resetUserPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetUser(null);
      setNewPassword("");
    },
    onError: (error) => toast.error(error.message || "Erro ao redefinir senha"),
  });

  const getUserGroups = trpc.tenant.getUserGroups.useQuery(
    { id: groupsUser?.id ?? 0 },
    { enabled: !!groupsUser }
  );

  const setUserGroups = trpc.tenant.setUserGroups.useMutation({
    onSuccess: async () => {
      toast.success("Grupos atualizados");

      if (groupsUser?.id) {
        await utils.tenant.getUserGroups.invalidate({ id: groupsUser.id });
      }
      // garante consistência caso você use groups.getMembers em outros lugares
      await utils.groups.list.invalidate();

      setGroupsUser(null);
      setSelectedGroupIds([]);
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar grupos"),
  });

  // ===== Effects =====
  useEffect(() => {
    if (groupsUser && getUserGroups.data?.groupIds) {
      setSelectedGroupIds(getUserGroups.data.groupIds);
    }
  }, [getUserGroups.data, groupsUser]);

  // ===== Handlers =====
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    if (isOwner) {
      if (!formData.tenantId) {
        toast.error("Selecione um tenant para o admin");
        return;
      }
      createAdmin.mutate({
        name: formData.name,
        tenantId: formData.tenantId,
        loginId: formData.loginId,
        password: formData.password,
        email: formData.email || undefined,
      });
      return;
    }

    // Admin tenant cria USER comum
    createUser.mutate({
      name: formData.name,
      loginId: formData.loginId,
      password: formData.password,
      email: formData.email || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (isOwner) {
      updateAdmin.mutate({
        id: editingUser.id,
        name: formData.name,
        role: formData.role,
        tenantId: formData.tenantId || undefined,
      });
      return;
    }

    // Admin tenant: só nome/email
    updateUser.mutate({
      id: editingUser.id,
      name: formData.name,
      email: formData.email || undefined,
    });
  };

  const handleOwnerRebaixarAdmin = (userId: number) => {
    if (!confirm("Tem certeza que deseja rebaixar este usuário para 'user'?")) return;
    deleteAdmin.mutate(userId);
  };

  const handleAdminDeleteUser = (userId: number) => {
    if (!confirm("Tem certeza que deseja REMOVER este usuário?")) return;
    deleteUser.mutate({ id: userId });
  };

  const openEditDialog = (user: any) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      loginId: user.openId || "",
      password: "",
      email: user.email || "",
      role: (user.role || "user") as any,
      tenantId: user.tenantId || 0,
    });
  };

  const openGroupsDialog = (user: any) => {
    setGroupsUser(user);
    setSelectedGroupIds([]);
  };

  const toggleGroup = (groupId: number) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((x) => x !== groupId) : [...prev, groupId]
    );
  };

  const saveUserGroups = () => {
    if (!groupsUser) return;
    setUserGroups.mutate({ userId: groupsUser.id, groupIds: selectedGroupIds });
  };

  const openResetPassword = (user: any) => {
    setResetUser(user);
    setNewPassword("");
  };

  const doResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;

    if (!newPassword || newPassword.length < 4) {
      toast.error("Senha muito curta");
      return;
    }

    resetUserPassword.mutate({ id: resetUser.id, password: newPassword });
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case "owner":
        return <Crown className="w-4 h-4 text-primary" />;
      case "admin":
        return <Shield className="w-4 h-4 text-chart-2" />;
      default:
        return <UserIcon className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case "owner":
        return <Badge className="bg-primary text-primary-foreground">OWNER</Badge>;
      case "admin":
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
            <h1 className="text-4xl font-bold text-foreground mono mb-2">USUÁRIOS</h1>
            <div className="h-1 w-32 bg-primary"></div>
            <p className="text-muted-foreground mt-2">
              {isOwner ? "Todos os usuários do sistema" : "Usuários do seu tenant"}
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" />
                {isOwner ? "Novo Admin" : "Novo Usuário"}
              </Button>
            </DialogTrigger>

            <DialogContent className="bg-card border-2 border-border">
              <DialogHeader>
                <DialogTitle className="text-2xl mono">
                  {isOwner ? "CRIAR ADMIN" : "CRIAR USUÁRIO"}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome Completo</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="border-2"
                    placeholder={isOwner ? "Nome do administrador" : "Nome do usuário"}
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
                  <p className="text-xs text-muted-foreground">Pode conter letras, números e ; . _ -</p>
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

                {isOwner && (
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
                        {tenants?.map((tenant: any) => (
                          <SelectItem key={tenant.id} value={tenant.id.toString()}>
                            {tenant.name} ({tenant.slug})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={isOwner ? createAdmin.isPending : createUser.isPending}
                >
                  {(isOwner ? createAdmin.isPending : createUser.isPending)
                    ? "CRIANDO..."
                    : isOwner
                    ? "CRIAR ADMIN"
                    : "CRIAR USUÁRIO"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <div className="brutalist-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary border-b-2 border-border">
                <tr>
                  <th className="text-left p-4 font-bold mono text-sm">ROLE</th>
                  <th className="text-left p-4 font-bold mono text-sm">NOME</th>
                  <th className="text-left p-4 font-bold mono text-sm">EMAIL/LOGIN</th>
                  {isOwner && <th className="text-left p-4 font-bold mono text-sm">TENANT</th>}
                  <th className="text-left p-4 font-bold mono text-sm">ÚLTIMO ACESSO</th>
                  <th className="text-right p-4 font-bold mono text-sm">AÇÕES</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={isOwner ? 6 : 5} className="text-center p-8 text-muted-foreground">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : !users || users.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 6 : 5} className="text-center p-8 text-muted-foreground">
                      Nenhum usuário cadastrado
                    </td>
                  </tr>
                ) : (
                  users.map((user: any) => (
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

                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Owner actions */}
                          {isOwner && user.role !== "owner" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(user)}
                                className="border-2"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>

                              {user.role === "admin" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOwnerRebaixarAdmin(user.id)}
                                  className="border-2 text-destructive hover:bg-destructive/10"
                                  title="Rebaixar admin"
                                >
                                  <Shield className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}

                          {/* Admin tenant actions */}
                          {isTenantAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(user)}
                                className="border-2"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>

                              {user.role === "user" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openGroupsDialog(user)}
                                    className="border-2"
                                    title="Grupos"
                                  >
                                    <UsersIcon className="w-4 h-4" />
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openResetPassword(user)}
                                    className="border-2"
                                    title="Resetar senha"
                                  >
                                    <KeyRound className="w-4 h-4" />
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAdminDeleteUser(user.id)}
                                    className="border-2 text-destructive hover:bg-destructive/10"
                                    title="Remover"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
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

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="border-2"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="border-2"
                  placeholder="email@exemplo.com"
                />
              </div>

              {/* Owner pode alterar role/tenant */}
              {isOwner && (
                <>
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
                        {tenants?.map((tenant: any) => (
                          <SelectItem key={tenant.id} value={tenant.id.toString()}>
                            {tenant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isOwner ? updateAdmin.isPending : updateUser.isPending}
              >
                {(isOwner ? updateAdmin.isPending : updateUser.isPending) ? "SALVANDO..." : "SALVAR"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Groups Dialog (Admin tenant) */}
        <Dialog
          open={!!groupsUser}
          onOpenChange={(open) => {
            if (!open) {
              setGroupsUser(null);
              setSelectedGroupIds([]);
            }
          }}
        >
          <DialogContent className="bg-card border-2 border-border max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl mono">GRUPOS DO USUÁRIO</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Usuário:{" "}
                <span className="font-medium text-foreground">
                  {groupsUser?.name || groupsUser?.openId}
                </span>
              </div>

              <div className="border-2 border-border p-3 bg-secondary/30 max-h-[320px] overflow-auto">
                {groupsList?.data?.length ? (
                  <div className="space-y-2">
                    {groupsList.data.map((g: any) => (
                      <label
                        key={g.id}
                        className="flex items-center gap-3 p-2 border border-border bg-card hover:bg-secondary/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedGroupIds.includes(g.id)}
                          onCheckedChange={() => toggleGroup(g.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{g.name}</div>
                          {g.description ? (
                            <div className="text-xs text-muted-foreground truncate">
                              {g.description}
                            </div>
                          ) : null}
                        </div>
                        <Badge variant="outline">#{g.id}</Badge>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Nenhum grupo encontrado. Crie grupos na tela “Groups”.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" className="border-2" onClick={() => setGroupsUser(null)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-primary hover:bg-primary/90"
                  onClick={saveUserGroups}
                  disabled={setUserGroups.isPending}
                >
                  {setUserGroups.isPending ? "SALVANDO..." : "Salvar grupos"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog (Admin tenant) */}
        <Dialog
          open={!!resetUser}
          onOpenChange={(open) => {
            if (!open) {
              setResetUser(null);
              setNewPassword("");
            }
          }}
        >
          <DialogContent className="bg-card border-2 border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl mono">RESETAR SENHA</DialogTitle>
            </DialogHeader>

            <form onSubmit={doResetPassword} className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Usuário:{" "}
                <span className="font-medium text-foreground">
                  {resetUser?.name || resetUser?.openId}
                </span>
              </div>

              <div className="space-y-2">
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-2"
                  placeholder="Digite a nova senha"
                />
                <p className="text-xs text-muted-foreground">Use apenas letras, números e ; . _ -</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="border-2" onClick={() => setResetUser(null)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90"
                  disabled={resetUserPassword.isPending}
                >
                  {resetUserPassword.isPending ? "SALVANDO..." : "Resetar senha"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Info */}
        <div className="mt-6 p-4 bg-secondary border-2 border-border">
          <p className="text-sm text-muted-foreground">
            <strong>Roles:</strong>
            <span className="ml-2">
              <Crown className="w-3 h-3 inline" /> Owner = Super Admin do sistema
            </span>
            <span className="ml-2">
              <Shield className="w-3 h-3 inline" /> Admin = Administrador de um tenant
            </span>
            <span className="ml-2">
              <UserIcon className="w-3 h-3 inline" /> User = Usuário comum
            </span>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
