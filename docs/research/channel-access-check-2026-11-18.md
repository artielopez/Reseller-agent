# Channel access checkpoint — 18 November 2026

A bounded primary-source recheck during the owner's authorized sleep window. No private platform messages, account UI, bridge installation, live endpoint, subscription or outgoing communication was used. This does not authorize a connector or establish account-specific coverage.

## Result

The manual assisted workflow remains the usable path. No new documented access basis was found for automatic reading/sending through this personal Facebook profile, Group comments or Carousell. Beeper remains a conditional personal-Messenger candidate; the support inquiry has not supplied affirmative evidence. Do not interpret general API availability as Meta approval or complete Marketplace coverage.

| Source rechecked | What it establishes | What remains unresolved |
| --- | --- | --- |
| [Meta Messenger Platform overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview) | The documented messaging product uses a Facebook Page or Instagram Professional account and Page permissions/tokens. | It is not a personal-profile Marketplace inbox API. No account conversion is proposed or performed. |
| [Meta Graph API v19 changelog](https://developers.facebook.com/documentation/development/graph-api/changelog/version19.0) | Groups API permissions/features and group app installation were removed across versions on 22 April 2024. | This review found no documented replacement covering the requested personal Group-comment workflow. Workplace endpoints or old search results are not substitutes. |
| [Meta Marketplace announcement](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/) | Native availability replies can be enabled, previewed and edited during listing creation. | This Philippine account's eligibility, arbitrary-question coverage and external control/coordination are unverified. Native availability assistance is not a custom API or Group-comment reader. |
| [Beeper Desktop API](https://developers.beeper.com/desktop-api/) | Local chat/message API and MCP exist while Beeper runs; history can be limited, and the vendor warns about network suspensions from excessive sending. | Complete Marketplace/message-request coverage, reliable listing identity and platform permission for this proposed use. |
| [Beeper Messenger guide](https://help.beeper.com/chat-networks/messenger) | Personal Facebook accounts are supported; disconnected/expired connections can stop message receipt or sending. Business Pages are excluded. | Missed-message recovery and this seller's specific conversations. The guide does not establish continuous coverage; multiple Facebook accounts are described as a paid feature, so Artie/Janyl cannot be assumed to share one free bridge. |
| [Carousell terms, section 2](https://support.carousell.com/hc/en-us/articles/115011881808-Terms-of-Service) | Automated access/monitoring and automated/unauthorized messaging remain restricted. | An applicable approved integration or written authorization. Computer use does not supply an exception. The owner-declined support inquiry stays unsent. |
| [Carousell PH quick/auto replies](https://support.carousell.com/hc/en-us/articles/900006211046--Philippines-CarouBiz-tools-Quick-and-Auto-Reply) | Native CarouBiz quick templates and scheduled acknowledgments exist, with a 1,000-character limit and one auto reply per buyer/listing per 24 hours. | Current account entitlement/cost and general AI-conversation handling. Nothing was activated or purchased. |

## Beeper implementation details to retain for a permitted future pilot

The [official changelog](https://developers.beeper.com/desktop-api/changelog/) currently labels Desktop 4.2.808 (6 May 2026) as its latest listed API entry. It documents updating chat drafts, message send-state/edit/deletion metadata and bidirectional pagination cursors. Cursor strings must remain opaque. These are useful prospective reconciliation/draft-staging primitives, not a newly approved connector. Updating a chat draft is still an external write and must not be silently attached to the current manual app. The [MCP guide](https://developers.beeper.com/desktop-api/mcp/) documents local integration setup; no connection was added.

If access is later established, verify the installed runtime's actual version/capabilities, enroll only named sale threads, distinguish read/draft/send operations, and prove native/owner reply detection before automatic dispatch. Do not start a new chat, mark unrelated messages read, modify drafts or treat a pending send state as delivery during feasibility checks. Public Group comments remain separate from Messenger DMs.

## Operational check

At approximately 05:20 Manila, the Supabase integration returned only **Artie's Projects** and its **Reseller Agent** project (`ACTIVE_HEALTHY`). This confirms the current connection works; it does not establish SoleVault access. Multi-organization work remains a separate scoped-connection setup, with no credential or permission change during this window. [Setup and verification](../supabase-mcp-access.md).

Implementation CI **44176925049 passed** for `ab5c7d1`. Sites version **22 remains saved but undeployed**; live remains **20**. The remaining release prerequisite is the matching email-code template, followed by actual-device acceptance. No repeated build/browser suite was justified by this documentation-only checkpoint.
