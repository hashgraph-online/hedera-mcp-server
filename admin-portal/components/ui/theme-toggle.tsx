"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

interface ThemeToggleProps {}

/**
 * Theme toggle component that allows users to switch between light, dark, and system themes
 * Persists theme selection in localStorage and applies appropriate classes to the document root
 * @param props - Component props (currently unused)
 * @returns Theme toggle button with animated icons for different theme states
 */
export function ThemeToggle({}: ThemeToggleProps) {
  const [theme, setTheme] = React.useState<Theme>("system");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme") as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme("system");
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    const isDark = 
      newTheme === "dark" || 
      (newTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  const handleThemeChange = () => {
    const themes: Theme[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const newTheme = themes[(currentIndex + 1) % themes.length];
    
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleThemeChange}
      className="relative w-10 h-10 rounded-full bg-gradient-to-br from-hedera-purple/10 to-hedera-blue/10 hover:from-hedera-purple/20 hover:to-hedera-blue/20 border border-hedera-purple/20"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0 text-hedera-purple" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100 text-hedera-purple" />
      {theme === "system" && (
        <Monitor className="absolute h-3 w-3 bottom-0 right-0 text-hedera-blue" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}