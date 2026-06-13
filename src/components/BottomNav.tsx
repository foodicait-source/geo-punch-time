import { Link, useLocation } from "@tanstack/react-router";
import { Home, Calendar, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function BottomNav() {
  const { role, signOut } = useAuth();
  const loc = useLocation();

  const items = [
    { to: "/home", label: "Home", icon: Home },
    { to: "/history", label: "History", icon: Calendar },
    ...(role === "admin" ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {items.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => signOut()}
          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-5" />
          Logout
        </button>
      </div>
    </nav>
  );
}
