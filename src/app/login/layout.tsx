import type { ReactNode } from 'react';

// Layout for the login/signup auth routes.
// Hides the browser scrollbar on auth pages (clean, focused UX).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        body {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        body::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}
