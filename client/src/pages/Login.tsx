import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { KeyRound, User as UserIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Login() {
  const { login, loading, userData, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !userData) return;
    if (userData.role === "user") setLocation("/my-notifications");
    if (userData.role === "admin") setLocation("/dashboard");
    if (userData.role === "owner") setLocation("/superadmin");
  }, [isAuthenticated, userData, setLocation]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const finalLoginId = loginId.trim().toLowerCase();

    if (!finalLoginId) {
      toast.error("Informe seu usuário");
      return;
    }
    if (!password.trim()) {
      toast.error("Informe sua senha");
      return;
    }

    try {
      await login({
        loginId: finalLoginId,
        password,
        name: name.trim() || undefined,
      });
      toast.success("Login realizado");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao entrar");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md border border-border rounded-2xl p-6 sm:p-8 bg-card shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Entrar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Use seu usuário e senha (podem conter letras, números e ';'). Nome é opcional.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loginId" className="flex items-center gap-2">
              <UserIcon className="w-4 h-4" /> Usuário ou e-mail
            </Label>
            <Input
              id="loginId"
              type="text"
              placeholder="Digite seu usuário ou e-mail"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Senha
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="7h57d7"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2">
              <UserIcon className="w-4 h-4" /> Nome (opcional)
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
