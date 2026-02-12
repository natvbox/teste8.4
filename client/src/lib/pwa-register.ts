// Registro do Service Worker para PWA (sem interceptar /api e sem quebrar POST)

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    return registration;
  } catch (error) {
    console.warn("Falha ao registrar Service Worker:", error);
    return null;
  }
}

export async function unregisterServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
}
