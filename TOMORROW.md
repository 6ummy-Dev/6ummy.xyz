# 6ummy.xyz — plan for tomorrow

Roughly 60–75 minutes of actual work, most of it waiting on signup forms.
Do the phases in order — later ones depend on earlier ones.

**Golden rule:** never paste a token or secret into chat, into `content.js`, or
into the repo. Every secret belongs in Cloudflare's Worker settings, which is
private even though the repo is public.

---

## Phase 0 — get it on a real URL (10 min)

Do this first. The calendar, the Worker and Brave verification all need a real
origin — none of them work from a `file://` preview.

- [ ] GitHub repo → **Settings → Pages**
- [ ] Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
- [ ] Save, wait ~1 minute
- [ ] Open the URL it gives you (something like
      `6ummy-dev.github.io/6ummy.xyz/`) and confirm the wordmark and spec table render
- [ ] Add `?live=1` to that URL — the top bar should flood yellow

**Leave `6ummy.xyz` pointing at GoDaddy for now.** We repoint DNS only once
you're happy with the new site. No rush, and nothing else depends on it.

---

## Phase 1 — collect credentials (~20 min)

Four independent errands. Order doesn't matter. Keep each value in a notes app
or password manager as you go; you'll paste them all into Cloudflare in Phase 2.

### 1a. Twitch application (5 min)

- [ ] Go to **dev.twitch.tv/console/apps** → *Register Your Application*
- [ ] Name: anything unique, e.g. `6ummy-site-status`
- [ ] OAuth Redirect URL: `http://localhost` (unused, but the form requires one)
- [ ] Category: *Website Integration*
- [ ] Create → then **Manage** → copy the **Client ID**
- [ ] Click *New Secret* → copy the **Client Secret** (shown once — copy it now)

### 1b. Discogs token (2 min)

- [ ] Go to **discogs.com/settings/developers**
- [ ] *Generate new token* under Personal Access Token
- [ ] Copy it

This is what unlocks sleeve images — the API works without it, but returns no
artwork.

### 1c. Form endpoint (5 min)

- [ ] Sign up at **formspree.io** (free tier is fine for a contact form)
- [ ] Create a new form, point it at your email
- [ ] Copy the endpoint URL (looks like `https://formspree.io/f/xxxxxxx`)

This one is *not* a secret — it goes in `content.js`.

### 1d. Brave verification file (5 min)

You said you already have the code. In the GitHub web UI:

- [ ] **Add file → Create new file**
- [ ] Filename: `.well-known/brave-rewards-verification.txt`
      (typing the slash creates the folder and file together — the only way to
      make a dot-folder in the browser)
- [ ] Paste Brave's contents → Commit
- [ ] Confirm it loads at `YOUR-PAGES-URL/.well-known/brave-rewards-verification.txt`

Note: Brave will verify against `6ummy.xyz`, so full verification may have to
wait until DNS is repointed. Having the file committed now means it's ready.

---

## Phase 2 — deploy the Worker (~15 min)

I'll have the Worker code ready to paste. It does three jobs in one file:

| Route | What it returns |
|---|---|
| `/live` | Twitch status — is the stream on, title, viewers |
| `/dates` | Google Calendar `.ics` parsed into clean JSON |
| `/crate` | Discogs collection, newest first, with sleeve images |

Why a Worker at all: Twitch needs a client secret (can't be in a public repo),
Google's `.ics` feed sends no CORS headers (browsers refuse it), and Discogs
requires a User-Agent header that browser JavaScript isn't allowed to set. All
three problems disappear server-side, and it means no API keys in the repo.

Steps:

- [ ] **dash.cloudflare.com** → sign up / log in
- [ ] **Workers & Pages → Create → Start with Hello World → Deploy**
- [ ] **Edit code** → delete everything → paste mine → Deploy
- [ ] **Settings → Variables and Secrets** → add four **Secrets**:
      - `TWITCH_ID`
      - `TWITCH_SECRET`
      - `DISCOGS_TOKEN`
      - `CALENDAR_ID` → `jelhc76e0q5clq9er14l6963fo@group.calendar.google.com`
- [ ] Deploy again after adding secrets
- [ ] Copy the Worker URL (`something.workers.dev`)
- [ ] Test all three in a browser tab:
      - `WORKER-URL/live` → `{"live":false,...}`
      - `WORKER-URL/dates` → your calendar events
      - `WORKER-URL/crate` → your records

If all three return JSON, the hard part is over.

---

## Phase 3 — wire it up (5 min)

- [ ] Open `assets/js/content.js` in GitHub, click the pencil
- [ ] Set `workerUrl` to your Worker URL
- [ ] Set `formEndpoint` to the Formspree URL
- [ ] Set `email` to the address you actually want on the mailto fallback
- [ ] Commit → wait a minute → reload the site

Dates and Crate should now populate on their own. `calendarKey` becomes unused —
the Worker replaces it entirely, so no Google Cloud signup at all.

---

## Phase 4 — the part that's actually design (unbounded)

Everything above is plumbing. This is where the "no vibes" problem gets solved.
The site is deliberately spare, which means the content has to carry it.

- [ ] **One photo.** Drop it in `assets/img/`, point `hero.src` at it in
      `content.js`. It's desaturated automatically, so anything works — booth
      shot, crates, hands on the mixer. Grain and contrast beat resolution here.
- [ ] **Three or four crate notes.** Discogs supplies artist, title, label,
      catalogue number and year. It can't supply why the record matters. One or
      two sentences each — where you found it, what it does to a floor, who
      slept on it. This is the only thing on the site nobody else could write.
- [ ] **Read the bio out loud.** It's currently mine, not yours. Both languages
      are in `content.js` under `identity.bio`.
- [ ] **Add a real date** to the Google Calendar, even a past one, so the Dates
      section has something in it.

---

## Phase 5 — go live on the domain (only when happy)

- [ ] Decide: GitHub Pages, or move to Cloudflare Pages (same dashboard as the
      Worker, faster edge, and it'd all live in one place)
- [ ] Point `6ummy.xyz` DNS at whichever you choose
- [ ] Re-check Brave verification once DNS has propagated
- [ ] Keep the GoDaddy site up until the new one resolves cleanly

---

## What I'll have ready

- The three-in-one Worker, commented, paste-and-deploy
- Updated `app.js` that reads all three endpoints from the Worker
- Updated `content.js` with the new `workerUrl` field
- Crate rendering with sleeve thumbnails, grayscale, lazy-loaded, plus the
  notes-override map so hand-written entries sit under the data rows

---

## If something breaks

| Symptom | Cause |
|---|---|
| Page unstyled | `assets/css/style.css` path wrong |
| No spec table, no links | `content.js` or `app.js` not loading — check browser console |
| Dates empty | Worker `/dates` not returning JSON — test the URL directly |
| Crate empty, no images | `DISCOGS_TOKEN` missing or misspelled in Worker secrets |
| Bar never goes yellow | Expected unless you're actually streaming — test with `?live=1` |
| Stream won't play | Twitch blocks embeds on unknown hosts; only works on the deployed URL, not `file://` |
| CORS error in console | Worker's allowed-origin list doesn't include your Pages URL — tell me the URL and I'll adjust |

Browser console is `F12` → Console, or Cmd-Option-J. Ninety percent of problems
announce themselves there in plain English.
