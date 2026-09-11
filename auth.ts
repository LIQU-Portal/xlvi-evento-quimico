import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedDomains = new Set([
  "alumnos.udg.mx",
  "academicos.udg.mx",
]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],

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
  },
});