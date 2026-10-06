import { QuantitoLoader } from "@/components/quantito-loader";

export default function LoadingAccount() {
  return (
    <QuantitoLoader
      message="Preparando tu espacio…"
      detail="Estamos verificando tu registro e inscripciones."
    />
  );
}
