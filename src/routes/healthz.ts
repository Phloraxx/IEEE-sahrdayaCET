export async function loader() {
  return Response.json(
    { ok: true, service: "web" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
