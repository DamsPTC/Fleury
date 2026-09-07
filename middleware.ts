import { NextResponse } from 'next/server';
export function middleware(){
 const r=NextResponse.next();
 r.headers.set('Cache-Control','no-store, private');
 r.headers.set('X-Content-Type-Options','nosniff');
 r.headers.set('Referrer-Policy','no-referrer');
 r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
 return r;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.svg).*)']};
