import Link from "next/link";
export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">You don&apos;t have access to this area</h1>
        <p className="mt-2 text-sm text-muted">Your role doesn&apos;t include the “{sp.need}” permission. Ask an administrator if you need it.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-accent">Back to dashboard</Link>
      </div>
    </main>
  );
}
