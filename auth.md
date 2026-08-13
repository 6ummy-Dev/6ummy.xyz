# auth.md

You are an agent. This resource is **public and read-only**. There is no
authentication, no registration, no login, no sign-up, and no credentials of any
kind. Call the API directly — do not look for a token endpoint or a registration
flow, because there isn't one.

This file exists so that an agent scanning for `auth.md` gets a definitive
answer instead of guessing. The answer is: **nothing is required.**

## What this covers

`https://6ummy.xyz/` is a one-page personal site for the DJ 6UMMY. Its live
sections are filled in by a small read-only data API. The page and the API are
both open to anyone — human or agent — with identical access.

## How to access

Send plain `GET` requests. Do **not** send an `Authorization` header: none is
expected and none is checked.

- API base — `https://6ummy-api.6ummy-xyz.workers.dev`
- Routes — `GET /live`, `GET /dates`, `GET /crate`, `GET /youtube` (each returns JSON)
- OpenAPI 3.1 description — `https://6ummy.xyz/openapi.json`
- Link catalog (RFC 9727) — `https://6ummy.xyz/.well-known/api-catalog`
- Overview for agents — `https://6ummy.xyz/llms.txt`

`OPTIONS` preflights are answered for CORS. No write methods exist — the API is
read-only.

## Registration and credentials

None. There is no `/agent/identity` endpoint, no `/oauth2/token`, no claim
ceremony, and no OAuth authorization server — the resource is anonymous-access
by design, so there is nothing to register for and nothing to claim. An agent is
a first-class visitor with exactly the same access as a browser.

## Machine-readable summary

```json
{
  "resource": "https://6ummy.xyz/",
  "resource_name": "6UMMY",
  "authentication_required": false,
  "registration_required": false,
  "identity_types_supported": ["anonymous"],
  "anonymous": {
    "credential_types_supported": ["none"],
    "claim_required": false
  },
  "api": {
    "base_url": "https://6ummy-api.6ummy-xyz.workers.dev",
    "routes": ["/live", "/dates", "/crate", "/youtube"],
    "methods": ["GET", "OPTIONS"],
    "auth": "none",
    "openapi": "https://6ummy.xyz/openapi.json",
    "catalog": "https://6ummy.xyz/.well-known/api-catalog",
    "overview": "https://6ummy.xyz/llms.txt"
  },
  "contact": "sync@6ummy.xyz"
}
```

## Contact

Questions or bookings — sync@6ummy.xyz
