export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-lg font-semibold text-slate-900">Sin conexión</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        No hay conexión con el servidor. Los datos de los negocios se consultan siempre en vivo; vuelve a
        intentarlo cuando tengas conexión.
      </p>
    </div>
  );
}
