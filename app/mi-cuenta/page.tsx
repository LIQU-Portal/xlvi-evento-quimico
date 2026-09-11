import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

function getAccountType(email: string) {
  if (email.toLowerCase().endsWith("@alumnos.udg.mx")) {
    return "Participante";
  }

  return "Profesor";
}

export default async function MiCuentaPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/api/auth/signin?callbackUrl=/mi-cuenta");
  }

  const accountType = getAccountType(session.user.email);

  return (
    <main>
      <section>
        <p>Área personal</p>
        <h1>Mi cuenta</h1>

        <dl>
          <div>
            <dt>Nombre</dt>
            <dd>{session.user.name ?? "Sin nombre registrado"}</dd>
          </div>

          <div>
            <dt>Correo institucional</dt>
            <dd>{session.user.email}</dd>
          </div>

          <div>
            <dt>Tipo de cuenta</dt>
            <dd>{accountType}</dd>
          </div>

          <div>
            <dt>Registro al evento</dt>
            <dd>Pendiente</dd>
          </div>
        </dl>

        <Link href="/">Volver al sitio</Link>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit">Cerrar sesión</button>
        </form>
      </section>
    </main>
  );
}