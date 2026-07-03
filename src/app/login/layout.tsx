/**
 * Login layout — a minimal centered container with NO manager Sidebar.
 * The root layout delegates chrome to <AppShell>, which renders /login bare,
 * so this layout owns the full-viewport centering for the login screen.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      {children}
    </div>
  );
}
