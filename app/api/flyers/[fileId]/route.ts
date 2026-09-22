const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

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
    { next: { revalidate: 86400 } },
  );
  const contentType = driveResponse.headers.get("content-type") ?? "";

  if (!driveResponse.ok || !contentType.startsWith("image/")) {
    return new Response("Flyer no disponible.", { status: 404 });
  }

  return new Response(driveResponse.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "CDN-Cache-Control":
        "public, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
