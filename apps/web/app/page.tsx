import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900">
        Neu
      </h1>
      <p className="max-w-md text-lg text-gray-600">
        Stay productive at all times with incremental goals and measurable outcomes.
      </p>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Get started free
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
