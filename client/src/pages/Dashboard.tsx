import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardPage() {
  const { userData } = useAuth();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">
          Bem-vindo, {userData?.name || userData?.loginId}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="text-sm text-muted-foreground">
              Tenant
            </h2>
            <p className="text-lg font-semibold">
              {userData?.tenantId || "Global"}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="text-sm text-muted-foreground">
              Role
            </h2>
            <p className="text-lg font-semibold">
              {userData?.role}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="text-sm text-muted-foreground">
              Status
            </h2>
            <p className="text-lg font-semibold text-green-600">
              Ativo
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
