import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-lg font-semibold text-slate-900">No encontrado</p>
      <p className="mt-1 text-sm text-slate-500">El elemento que buscas no existe o se ha eliminado.</p>
      <Link href="/" className="mt-4 text-sm font-medium text-brand-700 hover:underline">
        Volver al dashboard
      </Link>
    </div>
  );
}
