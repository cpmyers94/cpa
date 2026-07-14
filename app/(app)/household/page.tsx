"use client";

import { useState } from "react";
import { Check, Copy, Crown } from "lucide-react";
import { useAuth } from "@/components/auth";
import { Card, inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import {
  joinHousehold,
  leaveHousehold,
  regenerateInviteCode,
  renameHousehold,
  setSharedEditing,
} from "./mutations";

export default function HouseholdPage() {
  const { supabase, user, household, members, refreshHousehold } = useAuth();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  if (!household || !user) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const isOwner = members.find((m) => m.isSelf)?.role === "owner";
  const otherMembers = members.filter((m) => !m.isSelf);

  async function copyCode() {
    if (!household) return;
    await navigator.clipboard.writeText(household.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refreshHousehold();
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError(null);
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") || "").trim();
    if (!code) return;
    if (
      !window.confirm(
        "Join this household? Everything you've added will move into the shared budget."
      )
    )
      return;
    setBusy(true);
    try {
      await joinHousehold(supabase, code);
      form.reset();
      await refreshHousehold();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join household.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (
      !window.confirm(
        "Leave this household? Your own entries move with you into a new private budget; entries added by others stay behind."
      )
    )
      return;
    await run(() => leaveHousehold(supabase));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Household">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-neutral-500">Name</label>
            {isOwner ? (
              <input
                defaultValue={household.name}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== household.name) {
                    run(() => renameHousehold(supabase, household.id, e.target.value));
                  }
                }}
                className={`${inputClass} mt-1 w-full max-w-sm`}
              />
            ) : (
              <p className="mt-1 font-medium">{household.name}</p>
            )}
          </div>

          <div>
            <label className="text-xs text-neutral-500">Invite code</label>
            <div className="mt-1 flex items-center gap-2">
              <code className="rounded-md bg-neutral-100 px-3 py-2 text-lg font-semibold tracking-widest dark:bg-neutral-800">
                {household.invite_code}
              </code>
              <button onClick={copyCode} className={ghostButtonClass} title="Copy">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              {isOwner && (
                <button
                  onClick={() => run(() => regenerateInviteCode(supabase))}
                  disabled={busy}
                  className={`${ghostButtonClass} text-xs`}
                >
                  Regenerate
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Share this code with someone so they can join your household from their own
              account.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Members">
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                {m.role === "owner" && <Crown size={14} className="text-amber-500" />}
                {m.display_name}
                {m.isSelf && <span className="text-xs text-neutral-400">(you)</span>}
              </span>
              <span className="text-xs uppercase text-neutral-400">{m.role}</span>
            </li>
          ))}
        </ul>
        {otherMembers.length === 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            It&apos;s just you so far. Share your invite code above to add someone.
          </p>
        )}
      </Card>

      <Card title="Editing permissions">
        {isOwner ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={household.shared_editing}
              disabled={busy}
              onChange={(e) =>
                run(() => setSharedEditing(supabase, household.id, e.target.checked))
              }
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">Anyone in the household can edit everything</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                When off, each person can still see everything but only edits their own
                entries.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {household.shared_editing
              ? "Everyone in this household can edit all entries."
              : "You can see everything, but only edit entries you added."}{" "}
            <span className="text-xs text-neutral-400">(only the owner can change this)</span>
          </p>
        )}
      </Card>

      <Card title="Join another household">
        <form onSubmit={handleJoin} className="flex flex-wrap items-center gap-2">
          <input
            name="code"
            placeholder="Enter invite code"
            className={`${inputClass} uppercase tracking-widest`}
          />
          <button type="submit" disabled={busy} className={buttonClass}>
            Join
          </button>
        </form>
        {joinError && <p className="mt-2 text-sm text-red-600">{joinError}</p>}
        <p className="mt-2 text-xs text-neutral-500">
          Joining moves everything you&apos;ve added into that household&apos;s shared budget.
        </p>
      </Card>

      {members.length > 1 && (
        <Card title="Leave household">
          <button onClick={handleLeave} disabled={busy} className={ghostButtonClass}>
            Leave this household
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            Your own entries move with you into a fresh private budget.
          </p>
        </Card>
      )}
    </div>
  );
}
