const monitors = [
  { id: 170, url: "https://pituteknik.net/public_monitor.php?client_id=170" },
  { id: 168, url: "https://pituteknik.net/public_monitor.php?client_id=168" },
];

export function ColdStorageMonitoring() {
  return (
    <section aria-label="Monitoring IoT cold storage" className="mb-6 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold text-ink">Monitoring suhu — Pituteknik</h2>
      <p className="mt-1 text-sm text-slate-500">
        IoT dikelola penyedia cold storage. Buka dashboard penyedia untuk melihat suhu dan waktu pembacaan terakhir.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {monitors.map((monitor) => (
          <a key={monitor.id} href={monitor.url} target="_blank" rel="noopener noreferrer"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-primary hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary">
            Monitor {monitor.id} ↗ <span className="sr-only">(tab baru)</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Tautan eksternal; aplikasi ini tidak menampilkan pembacaan sensor secara langsung.</p>
    </section>
  );
}
