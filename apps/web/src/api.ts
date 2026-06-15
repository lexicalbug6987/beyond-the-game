import type { TeamQuizResult } from "@team-culture-sim/sim-engine";

export interface SessionInfo {
  code: string;
  teamName: string;
  participantCount: number;
}

export type TeamResults = TeamQuizResult & { teamName: string; code: string };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function createSession(teamName: string): Promise<{ code: string; teamName: string }> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ teamName }),
  });
}

export function getSession(code: string): Promise<SessionInfo> {
  return request(`/api/sessions/${encodeURIComponent(code)}`);
}

export function submitAnswers(
  code: string,
  answers: Record<string, string>,
): Promise<{ ok: true; participantCount: number }> {
  return request(`/api/sessions/${encodeURIComponent(code)}/submissions`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export function getResults(code: string): Promise<TeamResults> {
  return request(`/api/sessions/${encodeURIComponent(code)}/results`);
}

export interface ContentField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface ContentPage {
  key: string;
  title: string;
  description?: string;
  fields: ContentField[];
}

export function getContent(): Promise<{ pages: ContentPage[] }> {
  return request("/api/content");
}

export function saveContent(
  pages: ContentPage[],
  token: string,
): Promise<{ ok: true; pages: ContentPage[] }> {
  return request("/api/content", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pages }),
  });
}
