// src/lib/http.ts
//ONLY use for functions that target ONLINE and REMOTE at once
//NOT for standard use, see api.ts and getBaseUrl() for that

import { API_BASE, OFFLINE_BASE } from "../config/env";
import { useAuth } from "../context/AuthContext";

type Target = "remote" | "offline";

const BASES: Record<Target, string> = {
  remote: API_BASE,
  offline: OFFLINE_BASE,
};

export async function apiFetch<T>(
  target: Target,
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const base = BASES[target];
  if (!base) {
    throw new Error(`No base URL configured for target "${target}"`);
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    (headers as any).Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[apiFetch ${target}] ${res.status} ${res.statusText}: ${text}`
    );
  }

  // if no body
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}
