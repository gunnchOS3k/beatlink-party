# Karaoke phrase pitch contribution correction

This Codex-authored candidate limits **server-accepted pitch contributions to one per karaoke phrase**. It fixes the reproduced duplicate pitch-award defect. It does not implement a durable room-wide active microphone lease or complete `BL-KARAOKE-EXCL-001`.

## Requirements and behavior

The inspected committed Cursor source is `02c0797f69af8aaed9596377e14206e2996a4bd2`. Its RTM says at most one seat holds a digital pitch claim, handoff requires a fresh grant, and microphone revocation leaves the timing fallback available. No simultaneous-pitch duet exception was found. The existing helper/banner checks do not enforce room scoring.

In `KaraokePerformance`, the first eligible bounded pitch report accepted within a phrase consumes its shared pitch contribution. Other vocalists continue to receive ordinary timing scores, with `Phrase hit (timing; pitch already counted)` feedback. Each singer retains their normal per-prompt idempotency. Multiple vocalists are still allowed; Band Roles scoring is unchanged.

The existing private scored-target set stores the shared contribution. Its normal snapshot serialization preserves it through JSON, hydration and reconnect. Normal round reset clears it. A fresh eligible claim on another phrase may come from a different singer; a previous singer's flag is not transferred to the next singer.

False/revoked client flags, fallback taps, invalid numeric bounds, stale rounds, disconnected seats and nonvocal/audience identities cannot reserve a new pitch contribution. Socket.IO continues to require the sending socket to own the claimed player id. The scoring ledger records whether the contribution was accepted or contended.

## Older snapshots

An older playing snapshot only records individual vocal targets, without enough information to prove whether a past score contained pitch. On first use of the new policy, already-scored phrases are conservatively sealed against another pitch contribution, and the policy marker is stored in the existing target set. Timing scoring and later unused phrases remain available. If an old score was actually timing-only, this can deny a remaining pitch opportunity for that one phrase; it does not invent historical microphone or pitch data.

## Limits and acceptance

Pitch, voiced-coverage and frame-count scalars remain client reports. Numeric bounds and a server scoring allocation do not prove microphone permission, live audio provenance, independent singing, or physical device behavior. A browser that lies about a revoked microphone can still submit apparently valid scalars; this patch does not add a server-observed revocation/nonce protocol or hardware capture mutex.

Handoff here means a fresh contribution on a later phrase, not an implemented mid-phrase microphone lease transfer or host singer-selection interface. First accepted server order determines the contribution; latency fairness and richer turn-taking presentation remain separate work. The full exclusivity/handoff/revocation RTM rows must retain their broader limitations.

Functional room, snapshot, reconnect, migration, rematch and real loopback socket tests accompany the change. No real Redis instance, browser microphone, human session, physical device or platform-performance acceptance is claimed. Distinct review remains pending. Existing concert-stage and version-2 result-authority code are unchanged. `HUMAN=false`, `RC2=false`, `V1=false` remain false; no release or deployment is authorized.
