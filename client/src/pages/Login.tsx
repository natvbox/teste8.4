import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [form, setForm] = useState({
    loginId: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async () => {
    if (!form.loginId || !form.password) {
      alert("Preencha todos os campos.");
      return;
    }

    try {
      await login(form.loginId, form.password);
      setLocation("/dashboard");
    } catch (err: any) {
      alert(err?.message || "Erro ao fazer login.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-xl font-bold text-center">
          Login
        </h1>

        <Input
          name="loginId"
          placeholder="Usuário ou email"
          value={form.loginId}
          onChange={handleChange}
        />

        <Input
          name="password"
          type="password"
          placeholder="Senha"
          value={form.password}
          onChange={handleChange}
        />

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? "Entrando..." : "Entrar"}
        </Button>
      </div>
    </div>
  );
}
