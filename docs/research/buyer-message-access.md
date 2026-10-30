# Buyer message access: APIs, browser control and local agents

**Follow-up, 29 October 2026:** the owner confirmed personal Facebook selling and wants automatic processing/replies for both Group comments and DMs. [Updated research](personal-account-automation-update.md) adds Meta's native Marketplace AI replies and Beeper's personal-Messenger API as investigation candidates. This original memo remains the initial evidence record; read the update and [new staged plan](../superpowers/plans/2026-10-29-sales-assistant.md) before selecting the next milestone.

## Scope and conclusion

The owner has both OpenClaw and Hermes on a Mac mini and requested research before implementation. This memo evaluates automatically reading Carousell, personal Facebook Marketplace and Facebook Groups inquiries. No account was opened, message read, agent configuration changed, monitor installed or message sent. Installed agent versions and account-specific capabilities have not been verified.

**Finding:** both agents have the technical browser capability, but a supported automatic inbox for all three channels is not established. Official Facebook Page messaging is the clearest API path. Personal Marketplace and arbitrary Group activity cannot be assumed to be covered by it. Carousell offers native replies and notifications, but no public personal-seller inbox API was found in the official material reviewed. That is a research result, not proof that no private partner API exists.

Existing project constraints still apply: no scraping, unauthorized message access or automatic sending. The research request does not authorize implementing an unattended collector or changing that scope.

## Channel findings

| Surface                                     | API finding                                                                                    | Browser/computer-use finding                                                                          | Decision                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Personal Carousell PH inbox                 | No documented general personal-seller inbox API found; partner access needs confirmation       | A logged-in browser could theoretically render the chats for an agent; live compatibility is untested | Do not build unattended collection without resolving Carousell permission                         |
| Personal Facebook Marketplace conversations | The documented Messenger API covers Page conversations, not a general personal-profile mailbox | Technically plausible through the signed-in UI, subject to session/history availability and policy    | No supported personal Marketplace connector verified                                              |
| Facebook Group post comments                | No general replacement Groups feed/comment API verified; old integration recipes are obsolete  | Could inspect permitted visible posts, but automatic monitoring is still automated collection         | Separate comments from private messages; group administration alone is not evidence of API access |
| Buyer DMs arising from a Group post         | Depends on whether the recipient is the seller's personal profile or a Page                    | A visible personal conversation may be readable through its UI                                        | Treat personal DMs under the personal-inbox limitation                                            |
| Facebook Page Messenger conversations       | Official Conversations/Send API exists, with Page tokens, permissions and access requirements  | Browser control unnecessary for the supported API workflow                                            | Preferred route if buyers actually message the Page                                               |

Meta's own API collection describes Page conversation listing, message retrieval, Page access tokens and `pages_messaging`, `pages_read_engagement`, and `pages_manage_metadata`. Access to ordinary customers can require Advanced Access. Its separate Send API documentation describes a standard 24-hour response window and other eligibility conditions; token possession alone does not authorize unrestricted sending. A Page connection should not be presented as importing existing personal Marketplace chats. [Meta Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a), [Meta Messenger collection](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api?entity=folder-22794852-9fcfb7b7-1d80-422d-b5c8-eb2b1003d4fc).

Zapier documents discontinuing its Groups integration on 22 April 2024 following Meta's API sunset. It also mentions a narrower business-Group private-reply mechanism; that is not a general replacement for reading every Group post/comment or personal inbox. Eligibility for that exception was not established here. The original Meta v19 announcement and changelog returned HTTP 429 during this research, so this memo does not claim to have inspected those pages successfully. [Zapier's own integration-removal notice](https://help.zapier.com/hc/en-us/articles/23970212345357-App-update-Facebook-Groups-app-removal).

## What computer use changes

OpenClaw documents a managed browser and attachment to selected/signed-in Chrome tabs. Its existing-session mode reuses visible login state and requires the relevant browser consent. This gives it a way to inspect rendered messages, subject to what that session actually exposes. It does not create an official marketplace integration. [OpenClaw browser profiles](https://docs.openclaw.ai/tools/browser/profiles), [existing-session documentation](https://docs.openclaw.ai/tools/browser/existing-session).

Hermes documents local browser automation and attaching to an existing Chromium-family browser. It separately documents macOS desktop control with Accessibility and Screen Recording permissions. For website text and controls, a browser adapter is more suitable than repeatedly interpreting desktop screenshots. This is an engineering recommendation, not a tested performance comparison between the user's installations. [Hermes browser automation](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser), [Hermes computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use).

A permission-approved browser collector would still need to handle missing history, collapsed messages, thread/listing matching, scrolling, unread state, login expiry, timeouts and UI changes. Opening a conversation may change its read state. DOM text access is generally easier to validate than OCR; screenshot-only capture can omit timestamps, clipped text or the thread identifier. An agent must report incomplete capture rather than invent a complete transcript.

The Mac mini must be awake and the chosen agent/session available. Native desktop control may additionally require an active graphical session. Use one browser controller at a time; running OpenClaw and Hermes against the same tab risks conflicting navigation and duplicate processing. The draft generator can be either agent independently of the collector.

## Platform permission is a separate requirement

Carousell's terms prohibit bots or other automated means to access, acquire, copy or monitor service content, alongside other messaging restrictions. The text is broad enough that merely switching from HTTP scraping to screenshots/clicks does not establish an exception. Seek a supported integration or written permission rather than treating the seller's login as platform approval. [Carousell terms](https://support.carousell.com/hc/en-us/articles/115011881808-Terms-of-Service).

Meta's published explanation says automated data access/collection without its prior permission violates its terms. It explicitly discusses automation that mimics normal interaction. This source is an older policy explanation; current full terms pages redirected to a login/block page during research, so account-specific permission remains unresolved. We found no documented general exemption for an unattended personal inbox agent. [Meta's explanation of automated collection](https://about.fb.com/news/2021/04/how-we-combat-scraping/).

Do not treat reduced frequency, a local browser, read-only intent or screenshot/OCR as proof of permission. Do not use private/reverse-engineered messaging endpoints, extracted session cookies, stealth/proxy rotation or CAPTCHA bypass as an implementation shortcut. Any future permitted prototype should stop on authentication challenges and ask the owner to handle them directly.

## Alternatives worth testing

**Carousell email notifications.** The current directly retrieved help page distinguishes normal accounts (daily unread-chat/offer summaries) from Professional accounts (daily or as-unread-items-arrive options). An earlier search snippet showed less specific information; prefer the retrieved page. Parsing an authorized mailbox can provide leads from emails already delivered to the owner, but the actual body, message coverage, delay and thread/listing identifiers require testing. Do not assume full message text, complete history, immediate delivery or reply-by-email. [Carousell notification settings](https://support.carousell.com/hc/en-us/articles/115006193447-How-do-I-manage-my-push-and-email-notifications).

**Carousell native replies.** Its Philippines CarouBiz documentation describes saved quick replies and scheduled auto-replies. These can acknowledge buyers while the owner is unavailable. They are platform-native templates, not a documented OpenClaw/Hermes connection. Confirm account eligibility and subscription terms before choosing this option. [CarouBiz quick/auto replies](https://support.carousell.com/hc/en-us/articles/900006211046--Philippines-CarouBiz-tools-Quick-and-Auto-Reply).

**Facebook Page messaging.** If suitable for the seller's workflow, support future conversations that arrive at a Page using Meta's documented API. This changes where buyers contact the seller; it does not automatically migrate existing Marketplace/Group personal conversations. Do not redirect Carousell buyers off-platform as a workaround: its chat guidelines restrict that behavior. [Carousell chat guidelines](https://support.carousell.com/hc/en-us/articles/23098039280793-Carousell-Chat-Guidelines).

**Explicit handoff of text.** Manually pasting a question into Reseller Agent remains the initial implementation path. A later user-invoked share action can reduce copying, but reading a platform page through an extension still needs an appropriate permission assessment. A notification-only monitor must label itself as partial coverage rather than a synchronized inbox. No Facebook email coverage was verified.

## Proposed architecture, if an intake method is approved

```text
Approved API / authorized notification mailbox / permitted browser capture
                                ↓
                 Capture + thread/listing identification
                                ↓
                  Owner-scoped Reseller Agent inquiries
                                ↓
                   OpenClaw OR Hermes drafts a reply
                                ↓
                     Seller reviews and approves
                                ↓
            Manual sending initially; authorized channel adapter later
```

Keep intake, drafting and delivery separate. Store source, account, channel, stable thread/message IDs where available, item link, observed timestamp and capture completeness. Deduplicate before generation; when source IDs are absent, use conservative duplicate detection and let the owner resolve ambiguous item matches.

For agents running on the Mac mini, an outbound job poller is a possible design: it claims one owner-scoped drafting job, uses the chosen local agent, and submits the draft. This avoids exposing a general-purpose browser/agent control port publicly. Use narrow credentials, job leases, idempotency and per-agent availability indicators. This is proposed engineering, not functionality present in the current app.

The current Sites demo is a static browser-local export. Shared inquiries and agent jobs require an authenticated backend and durable storage first. Preserve the planned Supabase ownership boundary and keep agent credentials server-side. A local agent may still send question text to its configured cloud model provider; local execution does not imply entirely local inference.

Buyer text is untrusted. The drafting worker should have no browser, shell, messaging or payment tools; those capabilities belong to separately constrained adapters if needed. Store only necessary buyer information, avoid full screenshot/transcript logs, and never let text in a message grant new tool permissions. Initial delivery remains manual, with the existing approval-invalidating revision design retained.

## Proposed next investigation

1. Confirm whether Facebook selling uses a personal profile, a Page or both, and whether Group inquiries mean comments, private DMs or community/group chats. Confirm whether the owner administers the relevant groups.
2. Check the installed OpenClaw/Hermes versions and available browser modes without changing configuration or reading real conversations.
3. Check Carousell account type and inspect owner-supplied notification examples for completeness. Do not assume Professional settings or upgrade the account automatically.
4. Ask Carousell whether a single-owner PH resale assistant can obtain authorized chat API access or written permission for read-only browser access. Prepare the request for review; sending it needs a separate instruction. For Facebook, determine Page API eligibility and the relevant app/access requirements.
5. Validate collector/deduplication/drafting behavior on a synthetic local test inbox. Exercise duplicate alerts, partial text, stale sessions and an instruction-injection message before any authorized live pilot.
6. Only after supported access is established, propose a narrowly scoped read-only live pilot. Record side effects such as read receipts; measure capture accuracy and missed/duplicate messages. Keep sending disabled.

**Recommendation:** implement the agent-independent reply-drafting workflow now when requested, design an intake adapter boundary, and pursue Page API eligibility plus notification evidence. Keep personal Carousell/Marketplace/Group browser monitoring classified as technically plausible but unapproved and untested—not promised as a reliable always-on feature.

## Evidence limits

This is public-documentation research, not a live integration test. Agent docs describe current published capabilities rather than proving the user's installed versions have them. No public Carousell personal-inbox API was located. Several Meta developer/help/legal pages were rate-limited or login-gated; the accessible Meta-maintained Postman search results and Meta policy explanation supplied the Page/API boundary, while Zapier supplied firsthand evidence about its own retired Groups connector. Private-partner access and narrower business exceptions remain open questions. Do not use third-party scraper advertisements as evidence of platform authorization.
