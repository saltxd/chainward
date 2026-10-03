// x402 discovery lives on the API host; crawlers start at the apex, so serve it here too.
const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

export async function GET() {
  const res = await fetch(`${API_URL}/.well-known/x402`, { next: { revalidate: 300 } });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}
