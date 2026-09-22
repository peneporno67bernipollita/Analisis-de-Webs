import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-extrabold text-white">
            B
          </span>
          <div>
            <p className="font-bold text-slate-900">Business Opportunity Scanner</p>
            <p className="text-xs text-slate-500">Acceso privado</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
