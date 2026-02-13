import { useState } from "react";
import { trpc } from "../lib/trpcClient";
import NotificationForm from "../components/NotificationForm";
import DashboardLayout from "../components/DashboardLayout";

export default function NotificationsPage() {
  const [page, setPage] = useState(0);

  const notificationsQuery = trpc.notifications.list.useQuery({
    limit: 20,
    offset: page * 20,
  });

  return (
    <DashboardLayout title="Notificações">
      <div className="space-y-6">
        {/* Formulário de envio */}
        <NotificationForm />

        {/* Histórico */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">
            Histórico de envios
          </h2>

          {notificationsQuery.isLoading && (
            <p>Carregando...</p>
          )}

          {notificationsQuery.data?.data?.length === 0 && (
            <p>Nenhuma notificação enviada.</p>
          )}

          <div className="space-y-3">
            {notificationsQuery.data?.data?.map((n) => (
              <div
                key={n.id}
                className="border rounded-lg p-3"
              >
                <div className="flex justify-between">
                  <strong>{n.title}</strong>
                  <span className="text-xs text-gray-500">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm mt-1">
                  {n.content}
                </p>

                {n.imageUrl && (
                  <img
                    src={n.imageUrl}
                    alt="media"
                    className="mt-2 max-h-40 rounded"
                  />
                )}

                <div className="text-xs text-gray-500 mt-2">
                  Prioridade: {n.priority}
                </div>
              </div>
            ))}
          </div>

          {/* Paginação simples */}
          <div className="flex justify-between mt-4">
            <button
              className="px-3 py-1 bg-gray-200 rounded"
              onClick={() =>
                setPage((p) => Math.max(p - 1, 0))
              }
              disabled={page === 0}
            >
              Anterior
            </button>

            <button
              className="px-3 py-1 bg-gray-200 rounded"
              onClick={() =>
                setPage((p) => p + 1)
              }
            >
              Próximo
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
