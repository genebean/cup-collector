"use client";

import { useMapTheme, type MapThemePreference } from "@/hooks/useMapTheme";

const OPTIONS: { value: MapThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light",  label: "Light"  },
  { value: "dark",   label: "Dark"   },
];

export function MapThemeSelector() {
  const { preference, setTheme } = useMapTheme();

  return (
    <div className="flex gap-2 px-4 py-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={[
            "flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer",
            preference === opt.value
              ? "bg-green-dark text-white border-green-dark"
              : "bg-white text-gray-600 border-gray-200 hover:border-green-dark hover:text-green-dark",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
