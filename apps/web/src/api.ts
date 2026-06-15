import type { TeamQuizResult } from "@team-culture-sim/sim-engine";

export interface SessionInfo {
  code: string;
  teamName: string;
  participantCount: number;
}

export type TeamResults = TeamQuizResult & { teamName: string; code: string };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
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
