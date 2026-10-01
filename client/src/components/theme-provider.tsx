import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
export type AccentColor = "default" | "blue" | "green" | "yellow" | "red" | "linear";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  defaultAccentColor?: AccentColor;
  accentStorageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accentColor: AccentColor;
  setAccentColor: (accentColor: AccentColor) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  accentColor: "default",
  setAccentColor: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "prokraya-ui-theme",
  defaultAccentColor = "default",
  accentStorageKey = "prokraya-ui-accent",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  const [accentColor, setAccentColor] = useState<AccentColor>(
    () => (localStorage.getItem(accentStorageKey) as AccentColor) || defaultAccentColor
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;

    if (accentColor === "default") {
      root.removeAttribute("data-accent");
    } else {
      root.setAttribute("data-accent", accentColor);
    }
  }, [accentColor]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    accentColor,
    setAccentColor: (accentColor: AccentColor) => {
      localStorage.setItem(accentStorageKey, accentColor);
      setAccentColor(accentColor);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
