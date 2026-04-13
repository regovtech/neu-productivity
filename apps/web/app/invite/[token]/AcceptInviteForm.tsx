"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  token: string;
  isNewUser: boolean;
  workspaceName: string;
}

export function AcceptInviteForm({ token, isNewUser, workspaceName }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accept = trpc.invites.acceptInvite.useMutation({
    onSuccess: () => {
      // Redirect to sign-in so they can log in with the new/existing account
      router.push("/login?invited=1");
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    accept.mutate({
      token,
      displayName: displayName.trim() || undefined,
      password: isNewUser ? password : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isNewUser && (
        <>
          <Input
            label="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane Smith"
          />
          <Input
            label="Create a password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </>
      )}

      {!isNewUser && (
        <p className="text-sm text-gray-600">
          You already have a Neurify account. Click below to join <strong>{workspaceName}</strong>.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <Button type="submit" loading={accept.isPending} className="w-full">
        {isNewUser ? "Create account & join" : `Join ${workspaceName}`}
      </Button>
    </form>
  );
}
