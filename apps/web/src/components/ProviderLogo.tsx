import type { OAuthProvider } from "@/lib/auth-providers";

/** Logos simples dibujados con formas básicas; decorativos (el botón ya tiene texto). */
export function ProviderLogo({ provider }: { provider: OAuthProvider }) {
  if (provider === "azure") {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5">
        <rect x="2" y="2" width="9.5" height="9.5" fill="#f25022" />
        <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7fba00" />
        <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00a4ef" />
        <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#ffb900" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5">
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285f4" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z" fill="#34a853" />
      <path d="M6.400 14c-.2-.6-.3-1.300-.3-2s.1-1.400.3-2V7.400H3.100a10 10 0 0 0 0 9.200L6.400 14z" fill="#fbbc05" />
      <path d="M12 5.900c1.500 0 2.800.5 3.800 1.500l2.800-2.800A10 10 0 0 0 3.100 7.400L6.400 10c.8-2.300 3-4.100 5.600-4.100z" fill="#ea4335" />
    </svg>
  );
}
