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
import { Calendar, Plus, Trash2, Clock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface ScheduleData {
  id: number;
  title: string;
  content: string;
  priority: "normal" | "important" | "urgent";
  scheduledFor: Date;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  isActive: boolean;
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleData[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    priority: "normal" as "normal" | "important" | "urgent",
    targetType: "all" as "all" | "users" | "groups",
    targetIds: [] as number[],
    scheduledFor: "",
    recurrence: "none" as "none" | "daily" | "weekly" | "monthly",
  });

  const listSchedules = trpc.schedules.list.useQuery({ limit: 100 });
  const groupsList = trpc.groups.list.useQuery({ limit: 100 });
  const createSchedule = trpc.schedules.create.useMutation();
  const deleteSchedule = trpc.schedules.delete.useMutation();

  useEffect(() => {
    if (listSchedules.data?.data) {
      setSchedules(listSchedules.data.data as any);
    }
  }, [listSchedules.data]);

  useEffect(() => {
    if (groupsList.data?.data) {
      setGroups(groupsList.data.data as any);
    }
  }, [groupsList.data]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.content || !formData.scheduledFor) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    try {
      await createSchedule.mutateAsync({
        title: formData.title,
        content: formData.content,
        priority: formData.priority,
        targetType: formData.targetType,
        targetIds: formData.targetIds,
        scheduledFor: new Date(formData.scheduledFor),
        recurrence: formData.recurrence,
      });

      toast.success("Agendamento criado com sucesso!");
      setIsCreateOpen(false);
      setFormData({
        title: "",
        content: "",
        priority: "normal",
        targetType: "all",
        targetIds: [],
        scheduledFor: "",
        recurrence: "none",
      });
      await listSchedules.refetch();
    } catch (error: any) {
      toast.error("Erro ao agendar: " + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este agendamento?")) return;
    try {
      await deleteSchedule.mutateAsync({ id });
      toast.success("Agendamento removido");
      await listSchedules.refetch();
    } catch (error) {
      toast.error("Erro ao remover");
    }
  };

  const toggleTargetId = (id: number) => {
    setFormData(prev => ({
      ...prev,
      targetIds: prev.targetIds.includes(id)
        ? prev.targetIds.filter(tid => tid !== id)
        : [...prev.targetIds, id]
    }));
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mono mb-2">AGENDAMENTOS</h1>
            <div className="h-1 w-32 bg-primary"></div>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" /> Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-4 border-border max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl mono">PROGRAMAR MENSAGEM</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateSchedule} className="space-y-4">
                <div className="space-y-2">
                  <Label>Título da Notificação</Label>
                  <Input 
                    value={formData.title} 
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    required className="border-2" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo</Label>
                  <Textarea 
                    value={formData.content} 
                    onChange={e => setFormData({...formData, content: e.target.value})}
                    required className="border-2 min-h-[100px]" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select 
                      value={formData.priority} 
                      onValueChange={(v: any) => setFormData({...formData, priority: v})}
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="important">Importante</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data e Hora de Envio</Label>
                    <Input 
                      type="datetime-local"
                      value={formData.scheduledFor} 
                      onChange={e => setFormData({...formData, scheduledFor: e.target.value})}
                      required className="border-2" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Recorrência</Label>
                  <Select 
                    value={formData.recurrence} 
                    onValueChange={(v: any) => setFormData({...formData, recurrence: v})}
                  >
                    <SelectTrigger className="border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      <SelectItem value="daily">Diária</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Destinatários</Label>
                  <Select 
                    value={formData.targetType} 
                    onValueChange={(v: any) => setFormData({...formData, targetType: v, targetIds: []})}
                  >
                    <SelectTrigger className="border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="groups">Grupos</SelectItem>
                      <SelectItem value="users">Usuários Específicos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.targetType === "groups" && groups.length > 0 && (
                  <div className="space-y-2 border-2 border-border p-3 rounded">
                    <Label className="font-bold">Selecione os Grupos:</Label>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {groups.map(group => (
                        <div key={group.id} className="flex items-center gap-2">
                          <Checkbox 
                            checked={formData.targetIds.includes(group.id)}
                            onCheckedChange={() => toggleTargetId(group.id)}
                          />
                          <label className="text-sm cursor-pointer">{group.name}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 gap-2">
                  {loading ? "AGENDANDO..." : <><Calendar className="w-4 h-4" /> CONFIRMAR AGENDAMENTO</>}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {schedules.length === 0 ? (
            <div className="brutalist-card p-12 text-center text-muted-foreground">
              Nenhum agendamento programado.
            </div>
          ) : (
            schedules.sort((a,b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()).map(s => (
              <div key={s.id} className="brutalist-card p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-secondary border-2 border-border">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{s.title}</h3>
                    <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date(s.scheduledFor).toLocaleString()}</span>
                      {s.recurrence !== 'none' && (
                        <span className="flex items-center gap-1 text-primary font-bold mono">
                          <RefreshCw className="w-3 h-3"/> {s.recurrence.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-[10px] font-bold border-2 ${s.isActive ? 'border-chart-2 text-chart-2' : 'border-muted text-muted'}`}>
                    {s.isActive ? 'ATIVO' : 'EXECUTADO'}
                  </span>
                  <Button variant="ghost" onClick={() => handleDelete(s.id)} className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
