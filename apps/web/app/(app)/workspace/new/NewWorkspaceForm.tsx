"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-derive slug from name unless the user manually edited it
  useEffect(() => {
    if (!slugEdited) {
      setSlug(toSlug(name));
    }
  }, [name, slugEdited]);

  // Debounced slug availability check
  const { data: slugCheck, isFetching: slugChecking } =
    trpc.workspaces.checkSlug.useQuery(
      { slug },
      { enabled: slug.length >= 3, staleTime: 0 }
    );

  const createWorkspace = trpc.workspaces.create.useMutation({
    onSuccess: (ws) => {
      router.push(`/workspace/${ws.slug}/settings`);
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError("Name is required"); return; }
    if (slug.length < 3) { setFormError("Slug must be at least 3 characters"); return; }
    if (slugCheck?.available === false) { setFormError("This slug is already taken"); return; }
    createWorkspace.mutate({ name: name.trim(), slug });
  }

  const slugOk = slug.length >= 3 && slugCheck?.available === true;
  const slugTaken = slug.length >= 3 && slugCheck?.available === false;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <Input
        label="Workspace name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Acme Corp"
        required
      />

      <div>
        <Input
          label="URL slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            setSlugEdited(true);
          }}
          placeholder="acme-corp"
          required
        />
        <p className="mt-1.5 text-xs">
          {slugChecking && <span className="text-gray-400">Checking…</span>}
          {!slugChecking && slugOk && (
            <span className="text-green-600">✓ Available — neurify.app/workspace/{slug}</span>
          )}
          {!slugChecking && slugTaken && (
            <span className="text-red-500">✗ Slug taken — try a different one</span>
          )}
          {!slugChecking && slug.length > 0 && slug.length < 3 && (
            <span className="text-gray-400">Minimum 3 characters</span>
          )}
        </p>
      </div>

      {formError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{formError}</p>
      )}

      <Button
        type="submit"
        loading={createWorkspace.isPending}
        disabled={slugTaken || (slug.length >= 3 && !slugOk)}
      >
        Create workspace
      </Button>
    </form>
  );
}
