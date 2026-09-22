"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Download, Smartphone } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Instalación de la PWA y activación de notificaciones push en el dispositivo actual. */
export function MobileSetup({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Detección de capacidades del navegador tras montar (no disponible en SSR)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    );
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(ok);
    if (ok) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((s) => setSubscribed(Boolean(s)))
        .catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function subscribe() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("Permiso de notificaciones denegado en este dispositivo.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("No se pudo registrar la suscripción");
      setSubscribed(true);
      setMsg("Notificaciones activadas en este dispositivo.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("Notificaciones desactivadas en este dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    setMsg(res.ok ? "Notificación de prueba enviada." : "No se pudo enviar la prueba.");
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 text-slate-400" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-slate-800">Instalar en el móvil</p>
          {standalone ? (
            <p className="text-slate-500">La app ya está instalada en este dispositivo.</p>
          ) : installEvent ? (
            <button
              className={buttonClass("primary", "sm") + " mt-2"}
              onClick={() => installEvent.prompt().then(() => setInstallEvent(null))}
            >
              <Download className="h-3.5 w-3.5" /> Instalar aplicación
            </button>
          ) : isIos ? (
            <p className="text-slate-500">
              En iPhone: abre esta página en Safari → botón Compartir → «Añadir a pantalla de inicio».
            </p>
          ) : (
            <p className="text-slate-500">
              En Android (Chrome): menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».
            </p>
          )}
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 text-slate-400" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-slate-800">Avisos de seguimiento</p>
          {!vapidPublicKey ? (
            <p className="text-slate-500">
              Notificaciones no configuradas en el servidor (NEXT_PUBLIC_VAPID_PUBLIC_KEY /
              VAPID_PRIVATE_KEY).
            </p>
          ) : !pushSupported ? (
            <p className="text-slate-500">
              Este navegador no admite notificaciones push
              {isIos ? " (en iPhone requiere iOS 16.4+ y la app instalada en la pantalla de inicio)" : ""}.
            </p>
          ) : subscribed ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={buttonClass("secondary", "sm")} onClick={test} disabled={busy}>
                Enviar prueba
              </button>
              <button className={buttonClass("ghost", "sm")} onClick={unsubscribe} disabled={busy}>
                <BellOff className="h-3.5 w-3.5" /> Desactivar
              </button>
            </div>
          ) : (
            <button className={buttonClass("primary", "sm") + " mt-2"} onClick={subscribe} disabled={busy}>
              <Bell className="h-3.5 w-3.5" /> Activar notificaciones
            </button>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Recibirás un aviso cuando venza un seguimiento o termine un escaneo.
          </p>
        </div>
      </div>
      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
