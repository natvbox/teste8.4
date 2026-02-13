import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";

export default function SchedulePage() {
  const [form, setForm] = useState({
    title: "",
    content: "",
    priority: "normal",
    scheduledFor: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async () => {
    // ⚠️ Aqui depois conectamos com tRPC
    console.log("Agendar:", form);

    alert("Agendamento criado (placeholder).");
  };

  return (
    <DashboardLayout title="Agendamentos">
      <div className="bg-white rounded-xl shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold mb-4">
          Agendar Notificação
        </h2>

        <div className="space-y-4">
          <input
            name="title"
            placeholder="Título"
            className="w-full border p-2 rounded"
            value={form.title}
            onChange={handleChange}
          />

          <textarea
            name="content"
            placeholder="Mensagem"
            className="w-full border p-2 rounded"
            value={form.content}
            onChange={handleChange}
          />

          <select
            name="priority"
            className="w-full border p-2 rounded"
            value={form.priority}
            onChange={handleChange}
          >
            <option value="normal">Normal</option>
            <option value="important">Importante</option>
            <option value="urgent">Urgente</option>
          </select>

          <input
            type="datetime-local"
            name="scheduledFor"
            className="w-full border p-2 rounded"
            value={form.scheduledFor}
            onChange={handleChange}
          />

          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Criar Agendamento
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
