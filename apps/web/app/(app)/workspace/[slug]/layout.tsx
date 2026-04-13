import Link from "next/link";

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return (
    <div>
      {/* B2B workspace nav */}
      <nav className="mb-6 flex gap-4 border-b border-gray-200 pb-3 text-sm font-medium">
        <Link
          href={`/workspace/${params.slug}/members`}
          className="text-gray-600 hover:text-gray-900"
        >
          Members
        </Link>
        <Link
          href={`/workspace/${params.slug}/goals`}
          className="text-gray-600 hover:text-gray-900"
        >
          Goals
        </Link>
        <Link
          href={`/workspace/${params.slug}/settings`}
          className="text-gray-600 hover:text-gray-900"
        >
          Settings
        </Link>
      </nav>
      {children}
    </div>
  );
}
