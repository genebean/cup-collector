// Shown when a user is authenticated with PocketID but their sub does not
// appear in any household record — they have not been granted access.
export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-green-dark flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-4">☕</div>
      <h1 className="text-2xl font-bold text-white mb-2">Access Not Granted</h1>
      <p className="text-white/60 text-sm max-w-xs">
        Your account hasn&apos;t been added to a household yet. Ask the household
        owner to add your PocketID account.
      </p>
    </div>
  );
}
