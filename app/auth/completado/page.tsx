import Image from "next/image";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { OAuthComplete } from "@/components/oauth-complete";

export default async function OAuthCompletePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/iniciar-sesion");

  return (
    <main className="oauth-page">
      <section className="oauth-card oauth-card-complete" aria-live="polite">
        <Image src="/branding/isotipo.svg" alt="" width={64} height={64} priority />
        <h1>¡Listo!</h1>
        <OAuthComplete />
      </section>
    </main>
  );
}
