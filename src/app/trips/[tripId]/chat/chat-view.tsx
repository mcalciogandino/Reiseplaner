"use client";

import { Bot, Check, Globe, Send, User } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { PlanPreview } from "@/components/plan-preview";
import { Button } from "@/components/ui/button";
import { applyChatProposal, dismissChatProposal, sendChat, type ChatState, type StoredProposal } from "./actions";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; proposal: StoredProposal | null };

const EXAMPLES = [
  "Plane eine dreiwöchige Rundreise durch British Columbia und Alberta im Juli, mit Mietwagen ab Vancouver.",
  "Wir mögen Wandern und Camping, aber auch ein bis zwei Städte. Was empfiehlst du für Banff und Jasper?",
  "Wie lange sollten wir pro Station bleiben, damit die Fahrtage nicht zu lang werden?",
];

export function ChatView({
  tripId,
  messages,
  placeNames,
  enabled,
}: {
  tripId: string;
  messages: ChatMessage[];
  placeNames: string[];
  enabled: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [state, send, sending] = useActionState<ChatState, FormData>(async (prev, fd) => {
    const res = await sendChat(tripId, prev, fd);
    if (res?.done) formRef.current?.reset();
    return res;
  }, null);
  const unanswered = messages.at(-1)?.role === "user";

  return (
    <div className="flex flex-1 flex-col gap-4">
      {messages.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Beschreibe, wie die Reise sein soll. Die KI fragt nach, wenn etwas fehlt, und macht Vorschläge, die du prüfst und mit einem Klick einfügst.
          </p>
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                if (textRef.current) {
                  textRef.current.value = e;
                  textRef.current.focus();
                }
              }}
              className="min-h-11 rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-4" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className={`flex flex-col gap-3 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`flex max-w-[92%] gap-2 rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "bg-red-700 text-white"
                  : "border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              }`}
            >
              {m.role === "assistant" ? (
                <Bot aria-label="KI" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <User aria-label="Du" className="mt-0.5 size-4 shrink-0" />
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
            {m.proposal && !m.proposal.dismissed && (
              <div className="w-full">
                <Proposal tripId={tripId} message={m} placeNames={placeNames} />
              </div>
            )}
          </li>
        ))}
        {sending && (
          <li className="flex items-start">
            <p role="status" className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
              Die KI denkt nach … (bei längeren Plänen bis zu einer Minute)
            </p>
          </li>
        )}
      </ul>

      {state?.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}

      <form
        ref={formRef}
        action={send}
        className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-neutral-200 bg-[var(--background)] p-4 dark:border-neutral-800"
      >
        <label htmlFor="chat-text" className="sr-only">
          Nachricht an die KI
        </label>
        <textarea
          id="chat-text"
          ref={textRef}
          name="text"
          required={!unanswered}
          maxLength={4000}
          rows={3}
          disabled={sending}
          placeholder="Schreibe der KI, was du dir vorstellst …"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700"
        />
        {!enabled && (
          <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
            Die KI ist noch nicht eingerichtet:{" "}
            <Link href="/settings" className="underline">
              Claude-API-Schlüssel hinterlegen
            </Link>
            .
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="web" className="size-5 accent-red-700" />
            <Globe aria-hidden="true" className="size-4" /> Im Web recherchieren
          </label>
          <Button type="submit" disabled={sending}>
            <Send aria-hidden="true" className="mr-2 size-4" />
            {sending ? "Sende …" : unanswered ? "Antwort erneut anfordern" : "Senden"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Proposal({ tripId, message, placeNames }: { tripId: string; message: ChatMessage; placeNames: string[] }) {
  const stored = message.proposal!;
  const [state, apply, applying] = useActionState<ChatState, FormData>(
    applyChatProposal.bind(null, tripId, message.id),
    null,
  );
  const inserted = stored.applied || state?.done;

  if (inserted) {
    return (
      <p className="flex flex-wrap items-center gap-3 rounded-lg border border-green-600 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-200">
        <Check aria-hidden="true" className="size-4" /> Vorschlag eingefügt.
        <Link href={`/trips/${tripId}`} className="underline">
          Zur Zeitleiste
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <PlanPreview
        plan={stored.plan}
        apply={apply}
        applying={applying}
        title="Vorschlag zum Einfügen"
        submitLabel={`Ausgewählte einfügen`}
        extra={
          stored.plan.places.length > 0 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`pos-${message.id}`} className="text-sm font-medium">
                Einfügen nach
              </label>
              <select
                id={`pos-${message.id}`}
                name="pos"
                defaultValue=""
                className="min-h-11 rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700"
              >
                <option value="">Am Ende der Route</option>
                <option value="0">Ganz am Anfang</option>
                {placeNames.map((n, i) => (
                  <option key={`${n}-${i}`} value={i + 1}>
                    Nach «{n}»
                  </option>
                ))}
              </select>
            </div>
          ) : null
        }
        onDismiss={undefined}
      />
      <form action={dismissChatProposal.bind(null, tripId, message.id)}>
        <Button type="submit" variant="ghost">
          Vorschlag verwerfen
        </Button>
      </form>
      {state?.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}
