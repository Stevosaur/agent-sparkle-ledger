export default function Offline() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">You&apos;re offline</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">Receipts entered on the Receive screen are saved on this phone and sync automatically when you&apos;re back online.</p>
      </div>
    </main>
  );
}
