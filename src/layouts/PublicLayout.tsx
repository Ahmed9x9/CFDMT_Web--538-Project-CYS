import { Link, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/app/BrandLogo";
import { ThemeToggle } from "@/components/app/ThemeToggle";

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/60 backdrop-blur-xl">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7 shrink-0" />
            <span className="whitespace-nowrap font-display text-base font-bold tracking-tight text-foreground">CFDMT Web</span>
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90">
              <Link to="/register">Register</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        &copy; 2026 CFDMT Web - Corrupted File Detection & Management Tool
      </footer>
    </div>
  );
}
