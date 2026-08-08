Verification files live here.

Brave Creators: paste the file Brave gives you into this folder as
  .well-known/brave-rewards-verification.txt

Note: 6ummy.xyz is ALSO verified by DNS — there is a
"brave-ledger-verification=..." TXT record on the apex in Cloudflare.
If that record is present and confirmed in your Brave Creators
dashboard, this file is redundant. Check the dashboard before adding
it; two competing methods is not better than one that works.

This folder must exist in the repo for any of it to work, and the
GitHub web uploader silently skips anything starting with a dot —
see the note at the bottom of VERIFY.txt.
