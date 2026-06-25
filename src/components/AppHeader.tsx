import { Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { useNavigate, NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const AppHeader = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "text-sm font-medium transition-colors px-2 py-1 rounded-md",
      isActive
        ? "text-foreground bg-accent"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        <nav className="flex items-center gap-1">
          <NavLink to="/space" className={linkClass}>
            My Space
          </NavLink>
          <NavLink to="/chat" className={linkClass}>
            Chat
          </NavLink>
          <NavLink to="/artifacts" className={linkClass}>
            Artifacts
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          {user && (
            <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate("/auth"))} className="h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
