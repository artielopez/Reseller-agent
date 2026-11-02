# Draft support report: Sign in with ChatGPT consent timeout

Prepared 3 November 2026 (Asia/Singapore). **Not sent.** Contains no credentials, authorization URLs, host UUIDs, buyer messages or account identifiers.

Subject: Dynamic local-agent registration times out after consent

I am connecting a local personal resale-assistant worker to my ChatGPT plan using OpenClaw's SIWC flow. Account selection and agent naming work, but after approving identity and ChatGPT plan usage, the OpenAI page reports “Operation timed out.” No callback reaches the local listener and no connection is saved.

The latest attempt was approximately 18:27 UTC on 2 November 2026 (02:27 on 3 November in Singapore/Philippines). Previous fresh attempts on 2 November also timed out.

Technical details:

- macOS, Chrome, Node 24.21.0; installed OpenClaw package reports 2026.9.6.
- Initial registration uses `dynamic_agent_client`, `agent_name_hint=OpenClaw`, a persisted `ext_agent_host_id` in `urn:uuid:…` form, resource `https://api.openai.com/v1`, and `http://127.0.0.1:8080/auth/callback` for both authorization and exchange.
- Scopes: `openid email profile resource.invoke chatgpt.tokens.use.direct offline_access`; fresh state, nonce and S256 PKCE per attempt.
- Installed source and registry release 2026.10.9 omit the host ID and use `localhost`. A separate local compatibility copy corrected these fields in both compiled auth entrypoints. Offline invocation and the emitted CLI request verified the corrections; consent still timed out. The normal installation was not modified.
- The callback listener ran on the same Mac as Chrome and was stopped after the failed attempt. Token exchange was never reached. No inference call was made.

Could you check whether this account's dynamic registration/plan-sharing consent is failing on the service side, and advise a supported recovery path? Is there a relevant eligibility or rollout restriction that should produce a clearer error?

Reference: https://developers.openai.com/siwc/token-sharing-open-source/sign-in

The owner can identify the account through the authenticated support session. Do not attach authorization links, cookies, tokens or browser network exports.
