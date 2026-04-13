export default function WorkspaceSettingsPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Workspace settings</h1>
      <p className="mt-2 text-sm text-gray-500">
        Manage your workspace <strong>{params.slug}</strong>.
      </p>
      {/* Full settings form in a future sprint */}
    </div>
  );
}
