/** Kurze Versionsnummer (Git-Commit des Builds), damit man sieht, ob die neueste Version läuft. */
export function VersionStamp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "lokal";
  return (
    <p className="text-xs text-neutral-500">
      Version {sha}
    </p>
  );
}
