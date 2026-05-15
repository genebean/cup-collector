"use client";

import { useUiTheme, type UiThemePreference } from "@/hooks/useUiTheme";

const OPTIONS: { value: UiThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light",  label: "Light"  },
  { value: "dark",   label: "Dark"   },
];

export function UiThemeSelector() {
  const { preference, setTheme } = useUiTheme();

  return (
    <div data-testid="ui-theme-selector" className="flex gap-2 px-4 py-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={[
            "flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer",
            preference === opt.value
              ? "bg-green-dark text-white border-green-dark"
              : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-green-dark hover:text-green-dark",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
