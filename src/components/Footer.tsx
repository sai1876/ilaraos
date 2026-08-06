import Link from 'next/link';

const quickLinks = [
  ['Home', '/'], ['Menu', '/menu'], ['Rewards', '/referrals'], ['Social', '/social'], ['Profile', '/profile'],
];

export default function Footer() {
  return (
    <footer className="relative z-20 border-t border-[#E8DFD3] bg-[#FAF7F2] px-6 pb-32 pt-12 text-[#241A15] md:pb-10">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-serif text-xl font-bold">Ilara</p>
          <p className="mt-2 text-sm text-[#66554A]">Modern Indian Kitchen</p>
        </div>
        <nav aria-label="Footer quick links">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#9A642C]">Quick links</h2>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            {quickLinks.map(([label, href]) => <Link key={href} href={href} className="hover:text-[#9A642C]">{label}</Link>)}
          </div>
        </nav>
        <nav aria-label="Legal links">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#9A642C]">Legal</h2>
          <div className="mt-4 flex flex-col gap-2 text-sm"><Link href="/terms" className="hover:text-[#9A642C]">Terms of Service</Link><Link href="/privacy" className="hover:text-[#9A642C]">Privacy Policy</Link></div>
        </nav>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#9A642C]">Contact</h2>
          <a className="mt-4 inline-block text-sm hover:text-[#9A642C]" href="mailto:support@ilara.cafe">support@ilara.cafe</a>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl border-t border-[#E8DFD3] pt-6 text-xs text-[#66554A]">© 2026 Ilara. All rights reserved.</p>
    </footer>
  );
}
