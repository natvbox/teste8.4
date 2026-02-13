import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Send,
  Filter,
  Building2,
  Users,
  UsersRound,
  ShieldCheck,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";

type Priority = "normal" | "important" | "urgent";
type AdminTarget = "all" | "users" | "groups";
type OwnerTarget = "all" | "users" | "groups" | "admins" | "tenants";

function asArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "object" && Array.isArray(val.data)) return val.data as T[];
  return [];
}

function formatName(it: any) {
  // User/admin
  if (it?.openId || it?.email) {
    return it?.name || it?.email || it?.openId || `#${it?.id ?? ""}`;
  }
  // Group
  if (it?.description !== undefined) {
    return it?.name || `Grupo #${it?.id ?? ""}`;
  }
  // Tenant
  if (it?.slug !== undefined) {
    return it?.name || it?.slug || `Tenant #${it?.id ?? ""}`;
  }
  return it?.name || it?.title || `#${it?.id ?? ""}`;
}

function formatSub(it: any) {
  if (it?.email) return it.email;
  if (it?.openId) return it.openId;
  if (it?.slug) return it.slug;
  if (it?.description) return it.description;
  return "";
}

export default function Notifications() {
  const { isOwner, userData } = useAuth();
  const utils = trpc.useUtils();

  const [openCreate, setOpenCreate] = useState(false);

  // Owner: filtro/escopo
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [ownerTenantIds, setOwnerTenantIds] = useState<number[]>([]);

  const [form, setForm] = useState({
    title: "",
    content: "",
    priority: "normal" as Priority,
    targetType: (isOwner ? "all" : "all") as AdminTarget | OwnerTarget,
    targetIds: [] as number[],
  });

  // Se role mudar (ex: after me refetch), mantém targetType compatível
  useEffect(() => {
    setForm((p) => ({
      ...p,
      targetType: (isOwner ? "all" : "all") as any,
      targetIds: [],
    }));
    setOwnerTenantIds([]);
    // não mexe no tenantId pra não atrapalhar o filtro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // =========================
  // Data sources
  // =========================
  const tenantsQuery = trpc.superadmin.listTenants.useQuery(undefined, { enabled: isOwner });
  const adminsQuery = trpc.superadmin.listAdmins.useQuery(undefined, { enabled: isOwner });

  // Owner: users/groups by tenant
  const ownerUsersQuery = trpc.superadmin.listUsersByTenant.useQuery(
    { tenantId: tenantId ?? 0 },
    { enabled: isOwner && Boolean(tenantId) }
  );
  const ownerGroupsQuery = trpc.superadmin.listGroupsByTenant.useQuery(
    { tenantId: tenantId ?? 0 },
    { enabled: isOwner && Boolean(tenantId) }
  );

  // Admin: meu tenant
  const myUsersQuery = trpc.tenant.listMyUsers.useQuery(undefined, { enabled: !isOwner });
  const myGroupsQuery = trpc.groups.list.useQuery({ limit: 200 }, { enabled: !isOwner });

  // Normaliza shapes (alguns endpoints retornam [] e outros {data:[]})
  const tenants = asArray<any>(tenantsQuery.data);
  const admins = asArray<any>(adminsQuery.data);
  const ownerUsers = asArray<any>(ownerUsersQuery.data);
  const ownerGroups = asArray<any>(ownerGroupsQuery.data);
  const myUsers = asArray<any>(myUsersQuery.data); // ✅ tenant.listMyUsers = array direto
  const myGroups = asArray<any>(myGroupsQuery.data); // ✅ groups.list às vezes vem {data:[]}; asArray cobre

  const adminTargets = useMemo(() => {
    return [
      { value: "all", label: "Todos os meus usuários", icon: Users },
      { value: "users", label: "Usuários específicos", icon: Users },
      { value: "groups", label: "Grupos", icon: UsersRound },
    ] as const;
  }, []);

  const ownerTargets = useMemo(() => {
    return [
      { value: "all", label: "Todos os usuários do tenant", icon: Users },
      { value: "users", label: "Usuários específicos", icon: Users },
      { value: "groups", label: "Grupos", icon: UsersRound },
      { value: "admins", label: "Admins", icon: ShieldCheck },
      { value: "tenants", label: "Tenants (múltiplos)", icon: Building2 },
    ] as const;
  }, []);

  // =========================
  // Listagem de mensagens enviadas
  // =========================
  const listQuery = trpc.notifications.list.useQuery(
    {
      limit: 100,
      offset: 0,
      tenantId: isOwner ? (tenantId ?? null) : null,
    },
    {
      enabled: Boolean(userData),
      refetchOnWindowFocus: false,
    }
  );

  // =========================
  // Mutations
  // =========================
  const sendAdmin = trpc.notifications.send.useMutation({
    onSuccess: async () => {
      toast.success("Mensagem enviada");
      await utils.notifications.list.invalidate();
      setOpenCreate(false);
      setForm((p) => ({ ...p, title: "", content: "", targetIds: [] }));
    },
    onError: (e) => toast.error(e.message),
  });

  const sendOwner = trpc.notifications.ownerSend.useMutation({
    onSuccess: async () => {
      toast.success("Mensagem enviada");
      await utils.notifications.list.invalidate();
      setOpenCreate(false);
      setForm((p) => ({ ...p, title: "", content: "", targetIds: [] }));
    },
    onError: (e) => toast.error(e.message),
  });

  // =========================
  // Helpers
  // =========================
  const toggleId = (id: number) => {
    setForm((p) => ({
      ...p,
      targetIds: p.targetIds.includes(id)
        ? p.targetIds.filter((x) => x !== id)
        : [...p.targetIds, id],
    }));
  };

  const toggleTenantId = (id: number) => {
    setOwnerTenantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Preencha título e conteúdo");
      return;
    }

    try {
      if (isOwner) {
        const t = form.targetType as OwnerTarget;

        if (t !== "tenants" && !tenantId) {
          toast.error("Selecione um tenant");
          return;
        }

        if ((t === "users" || t === "groups" || t === "admins") && form.targetIds.length === 0) {
          toast.error("Selecione pelo menos 1 item");
          return;
        }

        if (t === "tenants" && ownerTenantIds.length === 0) {
          toast.error("Selecione pelo menos 1 tenant");
          return;
        }

        await sendOwner.mutateAsync({
          title: form.title.trim(),
          content: form.content.trim(),
          priority: form.priority,
          targetType: t,
          targetIds: t === "tenants" ? ownerTenantIds : form.targetIds,
          tenantId: t === "tenants" ? undefined : tenantId ?? undefined,
        });

        return;
      }

      // ADMIN
      const t = form.targetType as AdminTarget;

      if ((t === "users" || t === "groups") && form.targetIds.length === 0) {
        toast.error("Selecione pelo menos 1 item");
        return;
      }

      await sendAdmin.mutateAsync({
        title: form.title.trim(),
        content: form.content.trim(),
        priority: form.priority,
        targetType: t,
        targetIds: form.targetIds,
      });
    } catch {
      // toast já tratado no onError
    }
  };

  const audienceList = useMemo(() => {
    if (!isOwner) {
      const t = form.targetType as AdminTarget;
      if (t === "users") return myUsers;
      if (t === "groups") return myGroups;
      return [];
    }

    const t = form.targetType as OwnerTarget;
    if (t === "users") return ownerUsers;
    if (t === "groups") return ownerGroups;
    if (t === "admins") {
      const filtered = tenantId ? admins.filter((a: any) => a.tenantId === tenantId) : admins;
      return filtered;
    }
    return [];
  }, [isOwner, form.targetType, myUsers, myGroups, ownerUsers, ownerGroups, admins, tenantId]);

  const audienceLabel = (t: string) => {
    const items = isOwner ? ownerTargets : adminTargets;
    const found = items.find((x) => x.value === (t as any));
    return found?.label ?? t;
  };

  const priorityBadge = (p: Priority) => {
    if (p === "urgent") return <Badge variant="destructive">URGENTE</Badge>;
    if (p === "important") return <Badge variant="secondary">IMPORTANTE</Badge>;
    return <Badge variant="outline">NORMAL</Badge>;
  };

  const isSending = sendAdmin.isPending || sendOwner.isPending;

  // =========================
  // UI
  // =========================
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">Mensagens</h1>
            <p className="text-sm text-muted-foreground">
              Envie e acompanhe envios (deliveries reais).
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOwner ? (
              <div className="hidden sm:flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select
                  value={tenantId ? String(tenantId) : "all"}
                  onValueChange={(v) => setTenantId(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Filtrar por tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tenants</SelectItem>
                    {tenants.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" /> Nova mensagem
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Enviar mensagem</DialogTitle>
                </DialogHeader>

                <form className="space-y-4" onSubmit={onSubmit}>
                  {/* Destino + prioridade */}
                  {isOwner ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Destino</Label>
                        <Select
                          value={String(form.targetType)}
                          onValueChange={(v) => {
                            setForm((p) => ({ ...p, targetType: v as any, targetIds: [] }));
                            setOwnerTenantIds([]);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ownerTargets.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select
                          value={form.priority}
                          onValueChange={(v) =>
                            setForm((p) => ({ ...p, priority: v as Priority }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="important">Importante</SelectItem>
                            <SelectItem value="urgent">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(form.targetType as OwnerTarget) !== "tenants" ? (
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Tenant</Label>
                          <Select
                            value={tenantId ? String(tenantId) : ""}
                            onValueChange={(v) => {
                              setTenantId(Number(v));
                              setForm((p) => ({ ...p, targetIds: [] }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um tenant" />
                            </SelectTrigger>
                            <SelectContent>
                              {tenants.map((t: any) => (
                                <SelectItem key={t.id} value={String(t.id)}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Destino</Label>
                        <Select
                          value={String(form.targetType)}
                          onValueChange={(v) =>
                            setForm((p) => ({ ...p, targetType: v as any, targetIds: [] }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {adminTargets.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select
                          value={form.priority}
                          onValueChange={(v) =>
                            setForm((p) => ({ ...p, priority: v as Priority }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="important">Importante</SelectItem>
                            <SelectItem value="urgent">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Title + content */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Título</Label>
                      <Input
                        value={form.title}
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label>Mensagem</Label>
                      <Textarea
                        value={form.content}
                        onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>

                  {/* Selection lists */}
                  {isOwner && (form.targetType as OwnerTarget) === "tenants" ? (
                    <div className="space-y-2">
                      <Label>Tenants</Label>
                      <div className="max-h-[260px] overflow-auto rounded-xl border border-border">
                        <div className="p-3 space-y-2">
                          {tenants.map((t: any) => (
                            <label key={t.id} className="flex items-center gap-3 py-2">
                              <Checkbox
                                checked={ownerTenantIds.includes(t.id)}
                                onCheckedChange={() => toggleTenantId(t.id)}
                              />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{t.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{t.slug}</div>
                              </div>
                            </label>
                          ))}
                          {!tenants.length ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                              Nenhum tenant cadastrado.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (form.targetType === "users" ||
                      form.targetType === "groups" ||
                      form.targetType === "admins") ? (
                    <div className="space-y-2">
                      <Label>Selecionar</Label>
                      <div className="max-h-[260px] overflow-auto rounded-xl border border-border">
                        <div className="p-3 space-y-2">
                          {audienceList.map((it: any) => (
                            <label key={it.id} className="flex items-center gap-3 py-2">
                              <Checkbox
                                checked={form.targetIds.includes(it.id)}
                                onCheckedChange={() => toggleId(it.id)}
                              />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{formatName(it)}</div>
                                <div className="text-xs text-muted-foreground truncate">{formatSub(it)}</div>
                              </div>
                            </label>
                          ))}

                          {!audienceList.length ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                              Nenhum item disponível para seleção.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <Button type="submit" className="w-full gap-2" disabled={isSending}>
                    <Send className="w-4 h-4" />
                    {isSending ? "Enviando..." : "Enviar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Sent list */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="font-medium">Enviadas</div>
            <div className="text-sm text-muted-foreground">
              {listQuery.data?.total ?? (listQuery.data?.data?.length ?? 0)} mensagens
            </div>
          </div>

          <div className="divide-y divide-border">
            {asArray<any>(listQuery.data?.data).map((n: any) => (
              <div
                key={n.id}
                className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold truncate">{n.title}</div>
                    {priorityBadge(n.priority)}
                    {isOwner ? (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="w-3 h-3" /> Tenant #{n.tenantId}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {n.content}
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                    {" · "}
                    {audienceLabel(n.targetType)}
                  </div>
                </div>
              </div>
            ))}

            {!listQuery.isLoading && asArray<any>(listQuery.data?.data).length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma mensagem enviada ainda.
              </div>
            ) : null}
          </div>
        </div>

        {/* Owner mobile filter */}
        {isOwner ? (
          <div className="sm:hidden mt-4">
            <Select
              value={tenantId ? String(tenantId) : "all"}
              onValueChange={(v) => setTenantId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tenants</SelectItem>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
