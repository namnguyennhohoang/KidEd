import { type NextRequest, NextResponse } from 'next/server';

/**
 * Proxy cùng-origin tới `apps/api`. Trẻ và phụ huynh chỉ nói chuyện với origin của web,
 * không gọi trực tiếp API (không cần CORS; cookie HttpOnly nằm ở một origin duy nhất).
 * Set-Cookie từ API được chuyển tiếp nguyên vẹn (đã bỏ Domain để áp cho localhost:3000).
 */
const API_BASE = process.env.API_INTERNAL_BASE ?? 'http://localhost:4000';

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const url = `${API_BASE}/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const csrf = req.headers.get('x-csrf-token');
  if (csrf) headers.set('x-csrf-token', csrf);
  const shareToken = req.headers.get('x-share-token');
  if (shareToken) headers.set('x-share-token', shareToken);

  const method = req.method;
  // Chuyển tiếp body nguyên byte (JSON hoặc multipart/binary — không decode/encode).
  const buf =
    method === 'GET' || method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());
  const body = buf && buf.length > 0 ? buf : undefined;
  const contentType = req.headers.get('content-type');
  if (body && contentType) headers.set('content-type', contentType); // giữ boundary của multipart

  const upstream = await fetch(url, { method, headers, body, redirect: 'manual' });

  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });

  // undici: getSetCookie() trả mảng từng cookie.
  for (const sc of upstream.headers.getSetCookie?.() ?? []) {
    res.headers.append('set-cookie', sc.replace(/;\s*Domain=[^;]+/i, ''));
  }
  return res;
}

export function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return ctx.params.then(({ path }) => forward(req, path));
}
export function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return ctx.params.then(({ path }) => forward(req, path));
}
export function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return ctx.params.then(({ path }) => forward(req, path));
}
export function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return ctx.params.then(({ path }) => forward(req, path));
}
export function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return ctx.params.then(({ path }) => forward(req, path));
}
