# Versioned game-session authority correction

This is a Codex-authored corrective candidate, awaiting a distinct review. It hardens the Pedestrian-facing versioned game-session HTTP contract. The musical party modes continue to use their existing RoomManager/Socket.IO transport. No human or release approval is granted.

## Trust boundary and default behavior

`producedBy: "pedestrian-pursuit-race-runtime"`, boolean `sourceLog` fields and an unkeyed SHA256 digest are caller-controlled data. They do not authenticate a runtime or establish that a race occurred. The corrected server does not accept them as producer identity.

The current production server has **no authenticated Pedestrian runtime adapter**. After a valid room start, `POST /game-sessions/:code/runtime-result` therefore returns `503` with `error: "runtime_authority_unavailable"` and a message explaining that no authenticated runtime adapter is bound. It does not manufacture a valid result or silently fall back to host assertions. Neither the host credential, guest credential, public digest nor a body-supplied `runtimeSession` can authorize this endpoint.

Only trusted server-side code may call `bindRuntimeProducer({ roomCode, roundId, courseId })`. There is no HTTP binding/issuer endpoint. It creates a random 256-bit capability bound to one active playing round, one room and one course. A future adapter must authenticate or exclusively control the actual runtime first and deliver the capability through a private channel unavailable to host/guest clients. The runtime submits its result using `Authorization: Bearer <runtimeSession>`. The capability accepts one valid submission and is revoked at rematch, end or loss of room authority.

Calling the binder is not itself proof of actual Godot execution. It is a privileged adapter seam, not an implemented runtime-launch, signing or attestation service. The positive tests inject a trusted fixture capability in process; they do not establish production producer integration or gameplay completion. Do not add an HTTP issuer or give this capability to the ordinary host as a shortcut.

## Contract version 2 and lifecycle

Responses now advertise `gunnchos.beatlink.game_session` **version 2**. Public sessions include `roundId`; submitted results must contain the exact active round id, the bound course and valid positive safe-integer counters. The digest includes canonical round, counter and source-log fields and remains a content-consistency check only.

Normal progression is `lobby → playing → results → lobby` for rematch, or any active phase to `closed`. Start requires a connected member. A result must be authenticated before the host can publish it. Rematch requires results and refuses an existing exit decision. Each start creates a fresh random round id. Closed sessions cannot reopen; end revokes host/member/producer credentials and the invitation and closes shared room authority. Expired or externally revoked room/member authority cannot be revived through retained game-session records.

All HTTP host actions and result publication bind the presented credential to route `:code`. Redemption checks route-room equality before consuming the invitation. Invalid `rematch-or-exit` choices reject explicitly. The shared transport's visible phase follows the game-session phase.

## Existing Pedestrian producer and migration

The inspected consumer is `pedestrian-pursuit/tools/game_session_two_client.mjs`, at source SHA `bb0c3dac66d0d72f751dd1290da72221cff2cb91`. It imports an in-process frozen sibling contract by default, launches Godot processes, reads their result/report files and submits to that local module. It does not submit results to BeatLink's HTTP endpoint. Its frozen contract pin is `55825f4775615a2bd2f3099cb5ca5bfa98ddbf02`, contract version 1.

This correction does not modify that pinned copy or the active Pedestrian checkout. Their historical evidence remains bound to its original SHA and scope; it is not upgraded to the new security contract. Pointing `BEATLINK_ROOMS_ROOT` at the corrected modules is an explicit migration and will reject the old unauthenticated result flow. A migrated caller must check contract version 2, start the room to obtain `roundId`, and install a genuinely trusted runtime adapter before result publication. Do not copy fixture capabilities or use the host token as runtime authority.

An actual authenticated Godot producer, private capability delivery, consumer migration, cross-process/physical play, durable recovery and independent security review remain outstanding. This candidate is not a whole-product security certification.

## Validation scope

- Core tests cover missing runtime authority, forged host/member/producer credentials, room/round/course binding, malformed counters, replay, valid fixture result/rematch, permanent terminal closure, invitation integrity, and external revocation/expiry.
- Actual localhost HTTP tests exercise the same route-registration module used by `apps/server/src/index.ts`, with negative and positive fixture cases.
- A separate actual server-index smoke boots the real server with the memory store, checks version 2 and default unavailable runtime behavior, then confirms that end revokes host access through both the game-session and shared-room routes.
- The source reconciliation applies only Cursor's committed `ab7a8d9 → 79b051b` changes. Uncommitted Cursor files were not copied. All four independently reviewed concert-stage/HostPage hashes remain unchanged; the existing final karaoke cue review remains applicable to those bytes.

All candidate checks are author tests. Distinct review is required before applying an independent-verification label. `HUMAN=false`, `RC2=false`, `V1=false` remain unchanged. No deployment, release or publication is authorized.
