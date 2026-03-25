import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join('/');
  const url = `${API_URL}/api/${path}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete('host');

  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined;

  const response = await fetch(url, { method: req.method, headers, body });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export const GET = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const POST = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const PUT = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const PATCH = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const DELETE = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
