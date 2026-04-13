import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { TRPCProvider } from "@/components/providers/TRPCProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <TRPCProvider>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="text-lg font-bold text-brand-600">
              Neu
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/goals"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Goals
              </Link>
            </nav>
            <span className="text-xs text-gray-400">
              {session.user.email}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </div>
    </TRPCProvider>
  );
}
