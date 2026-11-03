# Operating Reseller Agent

Current mode, 3 November 2026: private cloud inventory and assisted replies. The Mac worker is paused and its supervised-trial enrollment revoked. Automatic reading, posting and buyer sending are not enabled. [Acceptance register](automation-acceptance.md) · [current evidence](project-status.md).

## Everyday use

1. Open [the private cloud app](https://reseller-agent-cloud.pandabur.chatgpt.site) with your invited ChatGPT account, then sign into the app with your own email link. Artie and Janyl have separate inventories; neither needs Supabase administrator access.
2. Save the item first. Add its facts, asking price and up to ten supported photos. Review each platform's listing copy, especially after a price or condition change. Copy it and post through the platform yourself; record the resulting URL/publication status in the app.
3. Choose **Open buyer inbox**, select the saved item, channel and question location, paste the buyer question, then **Save question**. Buyer name is optional. Automatic import is not available.
4. Use/edit a template or an existing AI draft. Review the saved facts and exact wording, save and explicitly approve the reply, then copy it. Send through the source platform yourself and separately mark the inquiry **Answered**.

Copying does not send a message or change inventory. Marking Answered invalidates the old reply approval under the current inquiry-change trigger, so a completed question can display its reply as Draft again; the inquiry remains Answered. Do not reapprove merely to complete the already-recorded manual reply.

The cloud's unconfigured listing-generation API uses labelled templates. The successful existing-OpenClaw connection is a separate buyer-drafting path; it does not automatically add AI listing generation to the cloud app.

## Supervised AI drafting

Follow [the exact subscription trial procedure](subscription-worker-trial.md) and [Mac worker setup](mac-draft-worker.md). The current subscription route permits one explicitly queued question and one foreground pass, with a reviewed input hash and short-lived account/allowance attestation. Its provider profile is fixed and API-key fallback is rejected.

Before another trial, verify the intended account, included allowance, zero paid credits, automatic reload off, training preference and installed runtime. A previous screenshot or trial is not a permanent spending guarantee. Keep identifiers/photos out of the model input unless a later specific workflow requires and authorizes them. Buyer content is data, never permission to run tools or follow links.

After verifying the saved unapproved draft, pause the queue, revoke that temporary enrollment and confirm the worker stopped. The owner then reviews and sends manually. Do not configure `worker:watch`, login startup or a scheduler for subscription trials; the separate API watch mode does not satisfy the no-additional-API-cost requirement.

## When something fails

| Symptom                                                   | Response                                                                                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in link expired or already used                      | Open the cloud app first, request a fresh link for the existing app account, and use the newest email on the same device. Do not share its URL or grant Supabase admin access as an email workaround |
| Save or photo upload fails                                | Preserve unsaved edits. After an uncertain save, reload/check inventory before any deliberate retry; do not assume the save failed or create a replacement item automatically                            |
| Worker outcome is `unknown` or an acknowledgment was lost | Stop and inspect the saved queue/draft before another attempt. A successful save may already exist. Follow [network recovery](worker-recovery-acceptance.md); never blindly repeat inference         |
| Worker cannot acquire its lock after a crash              | Keep the queue paused. Identify the exact worker/run and confirm its processes stopped before removing only that stale lock/run directory. No age/PID-only deletion or broad process killing         |
| A leased job appears stuck                                | Expiry alone does not change its displayed state. A later claim retires an expired lease; UI reload does not. Reconcile the exact job before any deliberate retry                                    |
| Item facts, terms or the question change                  | The old approval/draft context may be stale. Review and approve the current saved wording again before copying                                                                                       |
| A platform lacks supported automatic access               | Keep that channel manual or use an eligible platform-native feature under its own controls. Do not substitute scraping or unattended UI sending                                                      |

The current app has no external outage alert service. A quiet terminal or an old status timestamp is not evidence of healthy operation. No guaranteed availability or response-time claim is made while the worker is paused.

## Pause, recovery and data handling

The app's worker controls can pause new work or revoke enrollment. An operation already admitted may still finish, and a result submission already in flight may already be saved. Inspect durable state rather than infer the outcome from a local timeout. These app controls cannot disable a native Facebook/Carousell feature that was independently enabled on the platform.

The [local signal/lock tests](worker-recovery-acceptance.md) and [hosted concurrency checks](hosted-concurrency-acceptance.md) cover their recorded cases. Physical Mac restart/sleep and crash during real inference remain unverified. Do not reboot or interrupt the owner's normal OpenClaw service merely to simulate those scenarios; schedule a bounded test with the owner when necessary.

Never put credentials, buyer text, generated replies or production record identifiers in Git, public support reports or test fixtures. Use labelled synthetic data for acceptance. Operator SQL fixture procedures must clean up their exact generated owner and verify zero leftovers; they must never target real accounts. Ordinary app records persist until deliberately removed; the proposed 30-day retention policy and automated orphan-photo cleanup are not implemented.

## Releases and rollback

The live cloud app is Sites version **8**, published from source `318fc4add54b47ebeab24da29216e11c5c65973b`, with its audience limited to Artie and Janyl. The [inventory-save release](inventory-save-conflicts.md#review-and-release--3-november-2026) records the successful deployment. GitHub and the separate Sites source repository have different release histories. The seven hosted migrations are mapped in [the setup record](cloud-workspace-setup.md); their remote identifiers differ from local filenames.

[PR #27](https://github.com/artielopez/Reseller-agent/pull/27) contains the unmerged implementation stack plus current inventory reliability fix/evidence. Keep it reviewable; no merge or auto-merge without owner approval. Test/documentation-only increments need no cloud publication. A future publication must identify its exact source, preserve the private audience and verify the deployed behavior.

For a regression, first pause/revoke the affected worker capability and preserve the manual workflow. Prepare and verify a compatible prior app source before an authorized rollback. Do not revert to a client lacking save-revision support while the guard is active. Older open cloud editors must reload. Do not blindly revert to an older six-photo client after ten-photo data exists, reapply initial migrations, weaken RLS, or delete data to make an older build work. Disabling drafting is safer than guessing a migration downgrade.

For email or integration credentials, use each service's secure dashboard/secret configuration and verify the narrow connection afterward. See [Supabase multi-organization setup](supabase-mcp-access.md); replacing the current OAuth scope would remove access to the existing organization.
