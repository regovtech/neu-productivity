import { NewWorkspaceForm } from "./NewWorkspaceForm";

export default function NewWorkspacePage() {
  return (
    <div className="mx-auto max-w-xl py-12 px-4">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Create a workspace</h1>
      <p className="mb-8 text-sm text-gray-500">
        Set up a company workspace to invite your team and assign goals.
      </p>
      <NewWorkspaceForm />
    </div>
  );
}
