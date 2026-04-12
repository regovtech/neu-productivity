import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="mb-8 text-center">
        <Link href="/" className="text-2xl font-bold text-brand-600">
          Neu
        </Link>
        <p className="mt-1 text-sm text-gray-500">Productivity, measured.</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        {children}
      </div>
    </div>
  );
}
