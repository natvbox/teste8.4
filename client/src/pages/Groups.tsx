import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GroupsPage() {
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const groupsQuery = trpc.groups.list.useQuery({
    limit: 50,
    offset: 0,
  });

  const createMutation = trpc.groups.create.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
    },
  });

  const deleteMutation = trpc.groups.delete.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleCreate = async () => {
    if (!form.name) {
      alert("Nome é obrigatório.");
      return;
    }

    await createMutation.mutateAsync(form);

    setForm({
      name: "",
      description: "",
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Grupos</h1>

        {/* Form */}
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <Input
            name="name"
            placeholder="Nome do grupo"
            value={form.name}
            onChange={handleChange}
          />

          <Input
            name="description"
            placeholder="Descrição"
            value={form.description}
            onChange={handleChange}
          />

          <Button onClick={handleCreate}>
            Criar grupo
          </Button>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">
            Lista de grupos
          </h2>

          {groupsQuery.isLoading && <p>Carregando...</p>}

          <div className="space-y-2">
            {groupsQuery.data?.data?.map((g) => (
              <div
                key={g.id}
                className="border p-2 rounded flex justify-between"
              >
                <div>
                  <strong>{g.name}</strong>
                  <div className="text-xs text-gray-500">
                    {g.description}
                  </div>
                </div>

                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteMutation.mutate({
                      groupId: g.id,
                    })
                  }
                >
                  Excluir
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
