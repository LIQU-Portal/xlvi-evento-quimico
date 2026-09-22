const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_FLYER_BYTES = 10 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  if (!DRIVE_FILE_ID.test(fileId)) {
    return new Response("Identificador de flyer inválido.", { status: 400 });
  }

  const driveResponse = await fetch(
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
  );
  const contentType = driveResponse.headers.get("content-type") ?? "";

  if (!driveResponse.ok || !contentType.startsWith("image/")) {
    return new Response("Flyer no disponible.", { status: 404 });
  }

  const declaredSize = Number(driveResponse.headers.get("content-length"));

  if (Number.isFinite(declaredSize) && declaredSize > MAX_FLYER_BYTES) {
    return new Response("El flyer supera el tamaño permitido.", { status: 413 });
  }

  const flyer = await driveResponse.arrayBuffer();

  if (flyer.byteLength > MAX_FLYER_BYTES) {
    return new Response("El flyer supera el tamaño permitido.", { status: 413 });
  }

  return new Response(flyer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(flyer.byteLength),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "CDN-Cache-Control":
        "public, s-maxage=604800, stale-while-revalidate=2592000",
      "Vercel-CDN-Cache-Control":
        "public, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
