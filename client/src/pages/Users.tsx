import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UsersPage() {
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    loginId: "",
    name: "",
    password: "",
  });

  const usersQuery = trpc.users.list.useQuery({
    limit: 50,
    offset: 0,
  });

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
    },
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleCreate = async () => {
    if (!form.loginId || !form.password) {
      alert("Preencha login e senha.");
      return;
    }

    await createMutation.mutateAsync(form);

    setForm({
      loginId: "",
      name: "",
      password: "",
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Usuários</h1>

        {/* Form */}
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <Input
            name="loginId"
            placeholder="Login"
            value={form.loginId}
            onChange={handleChange}
          />

          <Input
            name="name"
            placeholder="Nome"
            value={form.name}
            onChange={handleChange}
          />

          <Input
            name="password"
            placeholder="Senha"
            type="password"
            value={form.password}
            onChange={handleChange}
          />

          <Button onClick={handleCreate}>
            Criar usuário
          </Button>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">
            Lista de usuários
          </h2>

          {usersQuery.isLoading && <p>Carregando...</p>}

          <div className="space-y-2">
            {usersQuery.data?.data?.map((u) => (
              <div
                key={u.id}
                className="border p-2 rounded flex justify-between"
              >
                <div>
                  <strong>{u.loginId}</strong>
                  <div className="text-xs text-gray-500">
                    {u.name}
                  </div>
                </div>

                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteMutation.mutate({
                      userId: u.id,
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
