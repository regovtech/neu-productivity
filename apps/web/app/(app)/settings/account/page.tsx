import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db/client";
import type { Metadata } from "next";
import { DeleteAccountSection } from "./DeleteAccountSection";

export const metadata: Metadata = { title: "Account Settings — Neu" };

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const [user] = await sql<{ email: string; display_name: string | null }[]>`
    SELECT email, display_name FROM users WHERE id = ${userId} AND deleted_at IS NULL
  `;
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Account Settings</h1>

      <section className="mb-8 rounded-xl border border-gray-200 p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Profile</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex gap-4">
            <dt className="w-28 text-gray-500">Email</dt>
            <dd className="text-gray-900">{user.email}</dd>
          </div>
          {user.display_name && (
            <div className="flex gap-4">
              <dt className="w-28 text-gray-500">Name</dt>
              <dd className="text-gray-900">{user.display_name}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-gray-900">Danger zone</h2>
        <DeleteAccountSection />
      </section>
    </div>
  );
}
