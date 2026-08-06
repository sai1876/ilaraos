import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-[75vh] place-items-center bg-[#FAF7F2] px-6 py-24 text-center text-[#241A15]">
      <div className="max-w-lg">
        <p className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-[#9A642C]">404 · Page not found</p>
        <h1 className="mt-5 font-serif text-4xl font-bold sm:text-5xl">This table is not on our map.</h1>
        <p className="mt-4 text-sm leading-6 text-[#66554A]">The link may be outdated, but you can continue exploring Ilara from here.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/" className="rounded-xl bg-[#9A642C] px-6 py-3 text-sm font-bold text-white hover:bg-[#805020]">Return Home</Link><Link href="/menu" className="rounded-xl border border-[#9A642C] px-6 py-3 text-sm font-bold text-[#9A642C]">View Menu</Link></div>
      </div>
    </main>
  );
}
