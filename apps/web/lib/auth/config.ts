import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const [user] = await sql<{ id: string; email: string; display_name: string | null; password_hash: string }[]>`
          SELECT id, email, display_name, password_hash
          FROM users
          WHERE email = ${email} AND deleted_at IS NULL
          LIMIT 1
        `;

        if (!user) return null;

        // TODO S1-5: replace with bcrypt verify
        const { verifyPassword } = await import("@/lib/auth/password");
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.display_name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        // Upsert user on OAuth sign-in, auto-create personal workspace
        await sql`
          INSERT INTO users (id, email, display_name, avatar_url)
          VALUES (${user.id!}, ${user.email}, ${user.name ?? null}, ${user.image ?? null})
          ON CONFLICT (email) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                avatar_url   = EXCLUDED.avatar_url
        `;
        await ensurePersonalWorkspace(user.id!, user.email);
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: env.NEXTAUTH_SECRET,
});

async function ensurePersonalWorkspace(userId: string, email: string) {
  const slug = `personal-${userId}`;
  await sql`
    INSERT INTO workspaces (id, slug, name, kind, plan)
    VALUES (gen_random_uuid(), ${slug}, 'Personal', 'personal', 'free')
    ON CONFLICT (slug) DO NOTHING
  `;
  const [ws] = await sql<{ id: string }[]>`SELECT id FROM workspaces WHERE slug = ${slug}`;
  if (ws) {
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${ws.id}, ${userId}, 'owner')
      ON CONFLICT DO NOTHING
    `;
  }
}
