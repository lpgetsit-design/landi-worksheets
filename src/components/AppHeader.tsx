import { Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";

const AppHeader = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        <button
          onClick={() => navigate("/")}
          className="text-sm font-semibold tracking-tight text-foreground hover:opacity-70 transition-opacity"
        >
          Worksheets
        </button>

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
