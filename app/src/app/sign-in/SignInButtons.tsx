"use client";

import { signIn } from "next-auth/react";

interface Household {
  id: string;
  name: string;
  group_slug: string;
}

interface Props {
  bypassEnabled: boolean;
  households: Household[];
}

const btnClass =
  "px-8 py-3 bg-gold text-green-dark font-bold rounded-xl cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all shadow-lg text-base capitalize";
const btnClassFull = `w-full ${btnClass}`;

export default function SignInButtons({ bypassEnabled, households }: Props) {
  if (bypassEnabled) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <p className="text-white/60 text-xs text-center uppercase tracking-widest">Dev bypass</p>
        {households.length === 0 && (
          <p className="text-white/40 text-xs text-center">
            No households found — is PocketBase running?
          </p>
        )}
        {households.map((household) => (
          <div key={household.id} className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">{household.name}</p>
            {(["owner", "viewer"] as const).map((role) => (
              <button
                key={role}
                className={btnClassFull}
                onClick={() =>
                  signIn("dev-bypass", {
                    callbackUrl: "/map",
                    role,
                    household: household.group_slug,
                  })
                }
              >
                {household.name} — {role}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <button
      className={btnClass}
      onClick={() => signIn("pocketid", { callbackUrl: "/map" })}
    >
      Sign in with PocketID
    </button>
  );
}
