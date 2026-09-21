import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedDomains = new Set([
  "alumnos.udg.mx",
  "academicos.udg.mx",
]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.trim().toLowerCase();
      const emailVerified = profile?.email_verified === true;

      if (!email || !emailVerified) {
        return false;
      }

      const domain = email.split("@").at(-1);

      return Boolean(domain && allowedDomains.has(domain));
    },
    async jwt({ token, profile }) {
      if (typeof profile?.picture === "string") {
        token.picture = profile.picture;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.picture === "string") {
        session.user.image = token.picture;
      }

      return session;
    },
  },
});
