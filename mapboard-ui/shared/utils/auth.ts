import { atom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { apiDomain } from "~/settings";

export interface Session {
  sub: string;
  name: string;
}

export type AccessLevel = "read" | "edit" | "admin";

const accessRank: Record<AccessLevel, number> = { read: 1, edit: 2, admin: 3 };

export function canEdit(access: AccessLevel | null): boolean {
  if (access == null) {
    return false;
  }
  return accessRank[access] >= accessRank.edit;
}

async function fetchSession(): Promise<Session | null> {
  try {
    const res = await fetch(`${apiDomain}/api/auth/me`);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

// undefined while loading, null when signed out
const sessionAtom = atom<Session | null | undefined>(undefined);
sessionAtom.onMount = (set) => {
  fetchSession().then(set);
};

export function useSession() {
  return useAtomValue(sessionAtom);
}

export function loginURL(): string {
  const returnURL = encodeURIComponent(window.location.href);
  return `${apiDomain}/api/auth/login?return_url=${returnURL}`;
}

export async function logout() {
  await fetch(`${apiDomain}/api/auth/logout`, { method: "POST" });
  window.location.reload();
}

export function useProjectAccess(project: string): AccessLevel | null {
  const session = useSession();
  const [access, setAccess] = useState<AccessLevel | null>(null);
  useEffect(() => {
    fetch(`${apiDomain}/api/auth/access/${project}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAccess(data?.access ?? null))
      .catch(() => setAccess(null));
  }, [project, session?.sub]);
  return access;
}
