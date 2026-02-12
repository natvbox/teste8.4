import React from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

const FEEDBACK_LABEL: Record<string, string> = {
  liked: "Gostei",
  renew: "Vou renovar",
  disliked: "Não gostei",
};

export default function UserNotifications() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();

  const inbox = trpc.notifications.inboxList.useQuery({ limit: 50, offset: 0 });
  const unread = trpc.notifications.getUnreadCount.useQuery();
  const markAsRead = trpc.notifications.markAsRead.useMutation();
  const setFeedback = trpc.notifications.setFeedback.useMutation();

  if (inbox.isLoading) return <div className="p-4">Carregando…</div>;
  if (inbox.error) return <div className="p-4">Erro ao carregar inbox.</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="m-0 text-xl font-bold">Minhas mensagens</h2>
          <div className="text-sm opacity-80">
            Não lidas: <b>{unread.data?.count ?? 0}</b>
          </div>
        </div>
        <button
          className="px-3 py-2 rounded border border-white/20 hover:bg-white/5"
          onClick={async () => {
            await logout();
            setLocation("/login");
          }}
        >
          Sair
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {(inbox.data?.data ?? []).map((m) => (
          <div
            key={m.deliveryId}
            className="border border-white/15 rounded-xl p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold truncate">{m.title}</div>
                <div className="opacity-70 text-xs">
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>

              {!m.isRead ? (
                <button
                  className="text-xs border border-white/20 rounded-md px-2 py-1 hover:bg-white/10"
                  onClick={async () => {
                    await markAsRead.mutateAsync({ deliveryId: m.deliveryId });
                    await inbox.refetch();
                    await unread.refetch();
                  }}
                >
                  Marcar como lida
                </button>
              ) : (
                <span className="opacity-70 text-xs">Lida</span>
              )}
            </div>

            <div className="mt-2 whitespace-pre-wrap">{m.content}</div>

            {m.imageUrl ? (
              <img
                src={m.imageUrl}
                alt="imagem"
                className="mt-3 w-full rounded-lg max-h-[420px] object-cover"
              />
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs opacity-80">
                Reação atual: <b>{m.feedback ? FEEDBACK_LABEL[m.feedback] : "—"}</b>
              </span>

              {(["liked", "renew", "disliked"] as const).map((opt) => (
                <button
                  key={opt}
                  className={
                    "text-xs rounded-full px-3 py-1 border border-white/20 hover:bg-white/10 " +
                    (m.feedback === opt ? "opacity-100" : "opacity-80")
                  }
                  onClick={async () => {
                    await setFeedback.mutateAsync({ deliveryId: m.deliveryId, feedback: opt });
                    await inbox.refetch();
                  }}
                >
                  {FEEDBACK_LABEL[opt]}
                </button>
              ))}
            </div>
          </div>
        ))}

        {!inbox.data?.data?.length ? (
          <div className="opacity-70">Nenhuma mensagem ainda.</div>
        ) : null}
      </div>
    </div>
  );
}
