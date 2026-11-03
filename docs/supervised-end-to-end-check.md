# Supervised end-to-end check

Use this when local browser access and the participants are available. This is a
short execution checklist for the implemented assisted workflow, not permission
to read platform inboxes or send automatically. Record outcomes in
[the acceptance register](automation-acceptance.md).

## Before starting

- Confirm the exact live Sites version and private Artie/Janyl audience from the
  latest [overnight ledger](overnight-work-2026-11-04.md). Reload old app tabs.
- Keep the Mac queue paused and existing trial enrollment revoked. Run the
  credential-free `npm run worker:check` from the repository; it must succeed
  before considering a supervised worker pass. This does not check live OAuth
  allowance or establish continuous worker health.
- Use each participant's own device/session. Janyl has activated and already
  saved an item/photo; do not send another invitation or recreate her account.
- Choose labelled test data. Record only pass/fail, device, app version and time
  in Git; keep real item/question text, user identifiers and URLs private.

## Inventory and session

1. Each participant saves and reloads a labelled item. Verify only that owner's
   inventory is visible, and confirm the actual image decodes after reload.
2. On the labelled acceptance item, save ten small supported photos and reload.
   Verify order/count and another owned device's access; reject an eleventh.
   Existing two-photo evidence does not satisfy this step.
3. Open the same owned item on two devices, save a change on one, then try the
   older editor. The second save must preserve edits and report a conflict.
   Reload deliberately; do not overwrite the first save by recreating the item.
4. Verify sign-in recovery using the newest email on the same device. A request
   timeout is uncertain: check the inbox before requesting another link.

## Buyer assistance

1. Open buyer inbox, select the saved item and manually record a synthetic buyer
   question with the correct channel/private-or-public source. Reload it.
2. Correct it with **Edit saved question** and save. Verify status/item linkage
   is preserved and any prior approval is invalidated. Cancel a second edit and
   confirm the saved question is unchanged.
3. Generate a labelled template or write a reply, save, review and approve.
   Copy into a private scratch field on the actual device. Clipboard success
   does not send or mark Answered. Do not send synthetic test text to a buyer.
4. Change relevant item facts; verify the earlier approval can no longer be
   copied until reviewed against current facts.

## Optional one-question AI pass

Only when the owner is present for fresh account/allowance/input verification,
follow [the subscription procedure](subscription-worker-trial.md). Do not infer
current allowance from the previous trial. Require the exact input hash, short
attestation, matching owner/OAuth account and temporary draft-only enrollment.
Run one foreground pass; no watch, startup service or API-key fallback.

Confirm one saved unapproved Agent Draft, then pause/revoke and confirm exit.
The owner reviews the exact text. Any real platform sending is a separate
manual action. Janyl's model use requires her own authorized account.

## Stop and reconcile

If a save/claim/result is uncertain, preserve edits and inspect durable state.
Do not replay inference, remove stale locks by age, erase questionable uploads
or retry sending automatically. Physical Mac sleep/restart and real provider
interruption remain separate planned checks and must not interrupt the owner's
normal OpenClaw service without a suitable window.
