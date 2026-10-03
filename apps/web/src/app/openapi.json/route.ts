// The public API's OpenAPI document, mirrored on the apex domain.
const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

export async function GET() {
  const res = await fetch(`${API_URL}/openapi.json`, { next: { revalidate: 300 } });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}
