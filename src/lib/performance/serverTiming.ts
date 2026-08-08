import { NextResponse } from 'next/server';

/**
 * Server-Timing Header Builder for Next.js APIs
 */
export class ServerTiming {
  private timings: { name: string; durMs: number; desc?: string }[] = [];
  private startTime: number = Date.now();

  public mark(name: string, durMs: number, desc?: string) {
    this.timings.push({ name, durMs: Math.round(durMs), desc });
  }

  public getHeaderString(): string {
    const totalMs = Date.now() - this.startTime;
    const parts = this.timings.map(t => `${t.name};dur=${t.durMs}${t.desc ? `;desc="${t.desc}"` : ''}`);
    parts.push(`total;dur=${totalMs}`);
    return parts.join(', ');
  }

  public applyToResponse(res: NextResponse): NextResponse {
    res.headers.set('Server-Timing', this.getHeaderString());
    return res;
  }
}
