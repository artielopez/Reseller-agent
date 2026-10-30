# Account capability evidence — 29 October 2026

This is a read-only feasibility check, not permission to integrate or evidence of reliable message delivery. The owner signed into Facebook and Carousell in Chrome on the Mac mini. No settings were saved, listings published, buyer conversations opened, messages sent, account connections added, or subscriptions purchased.

## Findings

| Surface                                           | Evidence on this account                                                                                                                                                                                                                                                                                                | Read / reply integration decision                                                                                                                                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facebook Marketplace, personal profile            | Signed-in selling dashboard and active listings visible. Marketplace Settings and a blank Item for sale form (including expanded details) inspected. No native seller AI-reply toggle visible in those desktop surfaces. “Set custom message” in settings is a buyer message default, not proof of seller auto-replies. | Native eligibility **unverified**, not ruled out: mobile UI or a later listing stage may differ. No custom reader/sender authorized by this observation.                                                                                              |
| Facebook personal DMs, including Group-origin DMs | No personal messaging API entitlement established. No inbox messages opened. Beeper absent from standard application folders/running-app inventory.                                                                                                                                                                     | **No-go for connector implementation yet.** Beeper is a conditional research candidate; documented local API availability does not establish Meta permission, Marketplace/message-request coverage or reliable listing IDs.                           |
| Facebook Group comments                           | No permitted personal-profile comment ingestion/reply API established. No Group posts or comments collected.                                                                                                                                                                                                            | **No-go for automatic capture/reply.** DMs and public comments remain separate destinations; a Messenger bridge would not solve comment capture.                                                                                                      |
| Carousell Philippines                             | Signed-in settings offer “Switch to Professional account”; this indicates the current account is not Professional. Notifications show transaction email and push channels enabled. Profile/settings navigation has no visible native quick/auto-reply control. No chat was opened or email example read.                | Native reply entitlement **unverified**; desktop settings alone do not establish CarouBiz subscription eligibility. Generic transaction notifications do not establish real-time complete buyer-message email delivery. No custom connector approved. |

Native Marketplace replies announced by Meta are a candidate, not verified on this account: [Meta announcement](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/). CarouBiz reply tools are documented for the Philippines: [Carousell help](https://support.carousell.com/hc/en-us/articles/900006211046--Philippines-CarouBiz-tools-Quick-and-Auto-Reply). See [research and permission limitations](personal-account-automation-update.md) before interpreting either as general API access.

For all live channels, source completeness, stable item mapping, native/owner-reply visibility, delivery acknowledgments, replay recovery and deletion/edit events remain untested. A signed-in browser is not an automation permission grant.

## Mac mini agent interfaces

- Installed OpenClaw reports 2026.9.6 (28226d9). Installed documentation describes the OpenResponses HTTP endpoint as disabled by default and operator-level access. Normal agent tools are available to such requests; a shared token is not a sufficiently narrow buyer-drafting boundary. Do not expose or use that general endpoint for buyer text.
- Hermes wrapper and installed source are present. Exact installed version remains unverified because its version invocation failed on an install-state lock. Source release metadata says 2026-09-24, which is not a verified runtime version. No permission repair, private memory/configuration inspection or gateway change was performed.
- A future adapter needs a dedicated restricted profile with no shell, browser, messaging or secret access; structured output validation; an allowlist of item facts; enforced retention; and a shared paid-call budget. Neither installed agent is connected by this implementation.

## Recommendation and remaining checkpoint

Proceed with the browser-local synthetic rule/outbox lab, with all real capture and sending disabled. Stop custom connector investment until permission and actual coverage are established. The existing shared Sites demo remains the inventory version; this new lab is on a review branch, not deployed.

Next, verify the native features in the platforms' mobile UI and obtain answers to the questions below. If permitted reliable access is unavailable, use native platform replies where eligible and manual assisted handling for the gaps. Do not substitute browser scraping or unattended UI sending.

### Support questions prepared for the owner — not sent

**Carousell Philippines**

1. Does this personal PH account qualify for native auto-replies? Is CarouBiz required, what is its cost, and can the exact response and scope be controlled?
2. Is there an approved read/reply API or partner integration for personal sellers? What written permission and account tier are required?
3. Do message notifications contain complete messages, stable conversation/listing IDs and immediate delivery? Can notification access be used by an authorized assistant, and how are missing events detected?

**Beeper / Meta access checkpoint**

1. Is this personal Facebook connection supported and permitted for automated processing and replies through the local API? What account or usage restrictions apply?
2. Does it include Marketplace chats, message requests and Group-origin private messages, with stable source IDs and listing links? Group comments must be assessed separately.
3. What delivery confirmation, idempotency, history reconciliation, edits/deletions and reconnect guarantees exist? Can native/owner replies be detected before custom dispatch?
4. Which data leaves the Mac and what retention/deletion controls apply?

Before any live reply pilot, collect the owner's exact permitted pickup area, hours, delivery/payment terms, price floors and escalation rules. The current demo infers none of these and makes no sale commitments.

## Documentation follow-up — 30 October 2026

No additional account UI was inspected and no bridge was installed or connected during this follow-up.

- **Carousell native tools:** the [Philippines quick/auto-reply documentation](https://support.carousell.com/hc/en-us/articles/900006211046--Philippines-CarouBiz-tools-Quick-and-Auto-Reply) describes CarouBiz templates and scheduled replies on app/web, up to 50 quick replies, a 1,000-character auto-reply limit and one auto-reply per buyer/listing in 24 hours. This is useful acknowledgment, not evidence of general AI conversation handling or an API entitlement. This account's eligibility/cost remains unconfirmed.
- **Facebook native availability replies:** [Meta's announcement](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/) describes previewing/editing/enabling replies during listing creation using listing facts. The owner has been asked whether the option appears on their iPhone; no answer has been recorded. Country/account eligibility is not established by the announcement.
- **Beeper:** its [Desktop API](https://developers.beeper.com/desktop-api/) is local and requires Beeper running. [Messenger support](https://help.beeper.com/chat-networks/messenger) covers personal Facebook, not business profiles, and documents missing-message/disconnection troubleshooting. These pages do not establish complete Marketplace coverage, Group comments, or Meta permission for this proposed automation. A local API does not establish that all bridge processing stays on the Mac.
- **Access and delivery:** [Beeper auth](https://developers.beeper.com/desktop-api/auth/) describes approved connections/token access. The [send endpoint](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/send/) returns a pending message ID; pending is not confirmed external delivery. Its returned chat ID can differ for a merged chat. No idempotency parameter appears on the inspected send reference. A future permitted pilot must establish reconciliation and destination verification before dispatch; none is implemented here.

Decision remains **no-go for live custom readers/senders** until permission and actual coverage are established independently per channel. The saved manual inbox can be built and tested without these connections. Public Group comments remain a separate unresolved source; a private Messenger bridge does not solve them. Existing support questions above are still drafts, not sent requests.
