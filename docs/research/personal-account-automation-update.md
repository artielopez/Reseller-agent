# Personal-account automation: research update

Researched 29 October 2026. Extends [the original investigation](buyer-message-access.md). The owner confirmed personal Facebook selling, both Group comments and DMs, and a goal of timely automatic reading, processing and replies with minimal engagement. This is research and a proposed plan, not implementation or permission to activate sending.

## Findings that change the proposal

### Native Marketplace replies should be investigated first

Meta's March 2026 announcement documents AI-generated availability replies that sellers can preview, edit and enable during listing creation. This is a real alternative to building an external sender for the first availability question. The announcement does not establish availability for this Philippine account, support for every question, or an API through which Reseller Agent could control it. It is not evidence of Group-comment automation. [Meta announcement](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/).

This feature was missing from the earlier research. Check eligibility before investing in a custom Marketplace first-response system. Native and custom replies need exclusive responsibility for each conversation; if native responses cannot be observed reliably, the custom sender must remain off for those threads.

### Beeper is a candidate for personal Messenger, not proof of full coverage

Beeper explicitly supports personal Facebook accounts, including sending and receiving Messenger messages; its guide excludes Business Pages and documents connection expiry and missed messages during disconnection. Marketplace-specific threads, message requests, listing identifiers and this account's history have not been tested or confirmed. [Beeper Messenger guide](https://help.beeper.com/en_US/chat-networks/messenger).

Its Desktop API exposes local chat/message access and sending while the desktop app runs. Indexed history can be incomplete. Beeper recommends personal use and warns about network suspensions from excessive sending. This is a Beeper-supported interface, **not evidence of Meta authorization for unattended resale automation**. The relevant Meta permission question remains open. Do not treat a third-party API as official Meta access. [Desktop API](https://developers.beeper.com/desktop-api/).

There is an experimental WebSocket stream. Its sequence numbers are connection-local, payloads are best effort and some events can be skipped. A future adapter needs HTTP cursor reconciliation after startup/reconnection and periodically, not just a listener. [Event-stream documentation](https://developers.beeper.com/desktop-api/websocket-experimental/).

Message APIs include chat IDs, message IDs, cursors and send status where supplied by the bridge. A pending message ID is not delivery confirmation. [Message reference](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/list/), [send/list methods](https://developers.beeper.com/desktop-api-reference/typescript/resources/messages/). The TypeScript SDK retries some errors automatically; a future sending adapter must disable automatic retries and reconcile uncertain outcomes. [SDK retry defaults](https://developers.beeper.com/desktop-api-reference/typescript/).

No Group post/comment interface was established. A Messenger group chat is different from comments beneath a Facebook Group sale post. Beeper cannot be assumed to solve the comments requirement. Its published API catalogue concerns messaging rather than Facebook post feeds. [API catalogue](https://developers.beeper.com/desktop-api-reference/).

The current subscription FAQ lists a free tier with one account per network, up to five accounts. Do not buy a plan yet: API entitlement, actual connection mode and relevant features must be checked in the installed release. The pricing page was inaccessible during this research; the FAQ is the available source, not a checkout quote. [Subscription FAQ](https://help.beeper.com/beeper-plus/beeper-plus-and-beeper-plus-plus-faqs).

### Carousell still needs its own solution

PH CarouBiz has scheduled auto-replies and saved quick replies. These are useful acknowledgments, not demonstrated context-aware agent replies. Eligibility and price for this account remain unknown. [CarouBiz documentation](https://support.carousell.com/hc/en-us/articles/900006211046--Philippines-CarouBiz-tools-Quick-and-Auto-Reply).

Normal-account emails are daily unread-chat/offer summaries; Professional accounts can choose emails as unread activity arrives. Neither option has been shown to contain complete messages or support reply-by-email. Email can contribute partial intake, not a promised real-time two-way connector. [Notification documentation](https://support.carousell.com/hc/en-us/articles/115006193447-How-do-I-manage-my-push-and-email-notifications).

The original memo's restrictions remain: Carousell terms restrict automated monitoring; Meta's published explanation requires permission for automated collection. Computer use is technically possible but not a permission workaround. No private endpoint, cookie extraction, stealth technique or account restriction bypass is proposed. [Carousell terms](https://support.carousell.com/hc/en-us/articles/115011881808-Terms-of-Service), [Meta explanation](https://about.fb.com/news/2021/04/how-we-combat-scraping/).

### Groups remain the hardest part

Zapier confirms the former Groups connector stopped following Meta's API sunset. Meta's developer overview returned HTTP 429 again in this session; a general current personal-profile Group-comment API was not verified. A narrow business feature or group-admin role must not be generalized to all personal-profile posts. [Zapier's connector notice](https://help.zapier.com/hc/en-us/articles/23970212345357-App-update-Facebook-Groups-app-removal).

If explicitly permitted later, a browser adapter would watch only registered URLs for the owner's sale posts, including nested comments and replies, using one browser session. It must distinguish post/comment IDs and public versus private destinations. Screenshot/OCR-only collection cannot be assumed complete. Notification emails or manually supplied text remain partial fallbacks. Permission and a reliable capture method are independent go/no-go tests.

## Using the existing agents

OpenClaw documents an HTTP Responses interface and layered tool restrictions. Hermes documents an API server and configurable toolsets. These are integration options, not proof of matching behavior in the installed releases. The draft worker must use a separate restricted profile, not the owner's general assistant. [OpenClaw API](https://docs.openclaw.ai/gateway/openresponses-http-api), [tool policy](https://docs.openclaw.ai/gateway/config-tools/tool-policy), [Hermes API](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server), [Hermes toolsets](https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference).

In particular, OpenClaw documents `store` as accepted but ignored. Passing `store: false` is not sufficient evidence of no agent history. Hermes' normal API can expose substantial tools. Tool denial, transcript retention and model-provider data handling need explicit local verification before buyer text is introduced. Do not copy the existing direct-OpenAI assumptions into an agent adapter.

Only executable/version metadata was checked locally: `openclaw` resolves to `/opt/homebrew/bin/openclaw` and reports **2026.9.6 (28226d9)**, after selecting its managed Node 24 runtime. `hermes` resolves to `/Users/artielopez/.local/bin/hermes`; its version command failed on a non-writable install lock. No permissions were changed or repair attempted. Hermes version, model settings, gateways, browser sessions and account connections remain unverified. No private configuration, credentials or message history was read.

## Decision

Investigate native Marketplace replies first, then Beeper as a **conditional personal-Messenger integration candidate**. Keep Group comments and Carousell as separate access workstreams. Use one constrained agent for drafting and a deterministic application worker for capture, rules and delivery. Do not build a general-purpose agent that can browse arbitrary personal conversations and decide to send on its own.

The [design](../superpowers/specs/2026-10-29-sales-assistant-design.md) and [staged plan](../superpowers/plans/2026-10-29-sales-assistant.md) describe an exception-based sales assistant, including automatic routine replies where the access and release gates pass. They do not promise full automation on channels that remain unsupported.
