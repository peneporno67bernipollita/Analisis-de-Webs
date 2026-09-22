"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-semibold text-red-800">Algo ha fallado al cargar esta página</p>
      <p className="mt-1 text-sm text-red-700">
        {/(ECONNREFUSED|P1001|database|DATABASE_URL)/i.test(error.message)
          ? "No se puede conectar con la base de datos. Comprueba que PostgreSQL está en marcha y DATABASE_URL en .env."
          : "Error inesperado. Revisa los logs del servidor."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-red-400">ref: {error.digest}</p>}
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200"
      >
        Reintentar
      </button>
    </div>
  );
}
