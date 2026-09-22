export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-7 w-48 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-200/60" />
    </div>
  );
}
