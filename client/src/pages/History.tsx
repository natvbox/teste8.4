import DashboardLayout from "@/components/DashboardLayout";

export default function History() {
  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mono mb-2">
            HISTÓRICO
          </h1>
          <div className="h-1 w-32 bg-primary"></div>
        </div>

        <div className="brutalist-card p-8">
          <p className="text-muted-foreground text-center">
            Funcionalidade de histórico em desenvolvimento
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
