import { describe, expect, it } from "vitest";
import { CHAT_TOOL_NAME, chatReply, normalizeTurns } from "../src/lib/ai/chat";

const creds = { apiKey: null, model: "m" };
const fake = (input: unknown, spy?: (args: Record<string, unknown>) => void) =>
  ({
    messages: {
      create: async (args: Record<string, unknown>) => {
        spy?.(args);
        return { stop_reason: "tool_use", content: [{ type: "tool_use", name: CHAT_TOOL_NAME, input }] };
      },
    },
  }) as never;

describe("normalizeTurns", () => {
  it("fasst gleiche Rollen zusammen und beginnt mit der Person", () => {
    expect(
      normalizeTurns([
        { role: "assistant", content: "Willkommen" },
        { role: "user", content: "Hallo" },
        { role: "user", content: "Plane Kanada" },
        { role: "assistant", content: "  " },
        { role: "assistant", content: "Gern" },
      ]),
    ).toEqual([
      { role: "user", content: "Hallo\n\nPlane Kanada" },
      { role: "assistant", content: "Gern" },
    ]);
  });
});

describe("chatReply", () => {
  it("braucht ohne Client einen Schlüssel", async () => {
    const r = await chatReply([{ role: "user", content: "Hi" }], "ctx", creds);
    expect(r.ok).toBe(false);
  });

  it("liefert nur Text, wenn die KI beraten hat", async () => {
    const r = await chatReply([{ role: "user", content: "Wie lange in Banff?" }], "ctx", creds, {}, fake({ message: "Drei Nächte." }));
    expect(r).toEqual({ ok: true, message: "Drei Nächte.", proposal: null });
  });

  it("liefert zusätzlich einen geprüften Vorschlag", async () => {
    const input = {
      message: "Hier mein Vorschlag.",
      proposal: { summary: "s", places: [{ ref: "p1", name: "Banff", kind: "city" }], transfers: [], questions: [] },
    };
    const r = await chatReply([{ role: "user", content: "Plane Banff" }], "ctx", creds, {}, fake(input));
    expect(r.ok && r.proposal?.places[0].name).toBe("Banff");
  });

  it("ein leerer Vorschlag zählt nicht", async () => {
    const r = await chatReply([{ role: "user", content: "x" }], "c", creds, {}, fake({ message: "Okay", proposal: { places: [], transfers: [] } }));
    expect(r.ok && r.proposal).toBeNull();
  });

  it("ein ungültiger Vorschlag lässt den Text stehen und sagt es", async () => {
    const r = await chatReply([{ role: "user", content: "x" }], "c", creds, {}, fake({ message: "Okay", proposal: { places: [{ ref: "p1", name: "X", kind: "ufo" }] } }));
    expect(r.ok && r.proposal).toBeNull();
    expect(r.ok && r.message).toMatch(/unvollständig/);
  });

  it("schickt den Stand der Reise nur mit der letzten Nachricht und erzwingt das Werkzeug", async () => {
    let seen: Record<string, unknown> = {};
    await chatReply(
      [
        { role: "user", content: "Erste" },
        { role: "assistant", content: "Antwort" },
        { role: "user", content: "Zweite" },
      ],
      "STAND",
      creds,
      {},
      fake({ message: "ok" }, (a) => (seen = a)),
    );
    const msgs = seen.messages as { role: string; content: string }[];
    expect(msgs[0].content).toBe("Erste");
    expect(msgs[2].content).toContain("STAND");
    expect(msgs[2].content).toContain("Zweite");
    expect(seen.tool_choice).toEqual({ type: "tool", name: CHAT_TOOL_NAME });
  });

  it("verlangt eine Nachricht der Person am Ende", async () => {
    const r = await chatReply([{ role: "assistant", content: "Hallo" }], "c", creds, {}, fake({ message: "x" }));
    expect(r.ok).toBe(false);
  });

  it("meldet einen abgelehnten Schlüssel verständlich", async () => {
    const client = { messages: { create: async () => { throw Object.assign(new Error("x"), { status: 401 }); } } } as never;
    const r = await chatReply([{ role: "user", content: "Hi" }], "c", creds, {}, client);
    expect(!r.ok && r.message).toMatch(/Schlüssel/);
  });
});
