import React from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

const FEEDBACK_LABEL: Record<string, string> = {
  liked: "Gostei",
  renew: "Vou renovar",
  disliked: "Não gostei",
};

function isVideo(url?: string) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes(".mp4") || u.includes(".webm") || u.includes(".ogg");
}

export default function UserNotifications() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();

  // =========================
  // Queries
  // =========================
  const inbox = trpc.notifications.inboxList.useQuery(
    { limit: 50, offset: 0 },
    { refetchOnWindowFocus: false }
  );

  // ✅ backend correto usa inboxCount
  const unread = trpc.notifications.inboxCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // =========================
  // Mutations
  // =========================
  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: async () => {
      await utils.notifications.inboxList.invalidate();
      await utils.notifications.inboxCount.invalidate();
    },
  });

  const setFeedback = trpc.notifications.setFeedback.useMutation({
    onSuccess: async () => {
      await utils.notifications.inboxList.invalidate();
    },
  });

  // =========================
  // Loading / Error
  // =========================
  if (inbox.isLoading) {
    return <div className="p-4">Carregando…</div>;
  }

  if (inbox.error) {
    return <div className="p-4">Erro ao carregar inbox.</div>;
  }

  const items = inbox.data?.data ?? [];

  // =========================
  // UI
  // =========================
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="m-0 text-xl sm:text-2xl font-bold">Minhas mensagens</h2>
          <div className="text-sm text-muted-foreground">
            Não lidas: <b>{unread.data?.count ?? 0}</b>
          </div>
        </div>

        <button
          className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition"
          onClick={async () => {
            await logout();
            setLocation("/login");
          }}
        >
          Sair
        </button>
      </div>

      <div className="grid gap-4">
        {items.map((m) => (
          <div
            key={m.deliveryId}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{m.title}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>

              {!m.isRead ? (
                <button
                  className="text-xs border border-border rounded-md px-2 py-1 hover:bg-muted"
                  onClick={() =>
                    markAsRead.mutate({ deliveryId: m.deliveryId })
                  }
                >
                  Marcar como lida
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Lida</span>
              )}
            </div>

            {/* Conteúdo */}
            <div className="mt-2 whitespace-pre-wrap text-sm">{m.content}</div>

            {/* Anexo */}
            {m.imageUrl ? (
              <div className="mt-3">
                {isVideo(m.imageUrl) ? (
                  <video
                    src={m.imageUrl}
                    controls
                    className="w-full rounded-xl border border-border max-h-[420px]"
                  />
                ) : (
                  <img
                    src={m.imageUrl}
                    alt="imagem"
                    className="w-full rounded-xl border border-border max-h-[420px] object-cover"
                  />
                )}
              </div>
            ) : null}

            {/* Feedback */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Reação:{" "}
                <b>
                  {m.feedback ? FEEDBACK_LABEL[m.feedback] : "Nenhuma ainda"}
                </b>
              </span>

              {(["liked", "renew", "disliked"] as const).map((opt) => (
                <button
                  key={opt}
                  className={
                    "text-xs rounded-full px-3 py-1 border border-border hover:bg-muted transition " +
                    (m.feedback === opt ? "bg-muted" : "")
                  }
                  onClick={() =>
                    setFeedback.mutate({
                      deliveryId: m.deliveryId,
                      feedback: opt,
                    })
                  }
                >
                  {FEEDBACK_LABEL[opt]}
                </button>
              ))}
            </div>
          </div>
        ))}

        {!items.length ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            Nenhuma mensagem ainda.
          </div>
        ) : null}
      </div>
    </div>
  );
}
