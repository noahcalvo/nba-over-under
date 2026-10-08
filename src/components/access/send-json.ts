export type SendResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

/** Sends a JSON request to one of our API routes and turns any failure into a message for the user. */
export async function sendJson(url: string, method: "POST" | "DELETE", body?: unknown): Promise<SendResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => ({}));
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (!response.ok) {
      return { ok: false, message: typeof record.message === "string" ? record.message : "Something went wrong." };
    }
    return { ok: true, data: record };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." };
  }
}
