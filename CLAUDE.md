# Brain Box — Project Notes

Cross-subject "weak topic" practice app for kids. Parent (or the kid directly) picks up to 8 topics from math/language/science into one Box; practice sessions and Drive Mode mix questions from all of them, weighted toward whichever topics the kid gets wrong most.

**Totally separate infra from `~/Documents/al-idrisi-games/`** — own GitHub repo, own Firebase project, own Vercel project, own Anthropic API key. The only thing shared with al-idrisi-games is *content*, pulled live over HTTP at runtime (see below) — never touch al-idrisi-games' Firebase/Vercel/repo from this project.

## Live URLs

- Production: **https://brainbox.lol** (official domain, bought + configured on Vercel) and https://brain-box-rust.vercel.app (same deployment)
- GitHub: https://github.com/adityaperdanasp/brain-box (private)
- Firebase project: `brain-box-af9a6` (Realtime Database only — `apiKey`/`appId` in `scripts/firebase.js` are still TODO placeholders; RTDB works fine without them since there's no Firebase Auth, just direct DB reads/writes)
- Vercel project: `ellilo/brain-box`

Deploy: `git push` (GitHub) + `vercel --prod --yes` from the repo root. Both needed — GitHub push alone doesn't deploy.

## Architecture

- **Content**: `scripts/content-loader.js` fetches live from `playalidrisi.fun` at runtime — `mathville/questions.js`+`generators.js`, `azkacraft/questions.json`, `azkauniverse/questions.json`, all via public CORS-open URLs. Normalizes 6 different question shapes (mc/fill/generator/match/flashcard/sentence-builder) into one canonical always-multiple-choice format. **Whenever al-idrisi-games adds a new field to its question schema (e.g. the `image` field added for diagram questions), check ALL SIX normalizer functions in content-loader.js, not just the one for the type that changed first** — this has bitten us twice already (mc questions in azkauniverse, then fill questions in mathville, both dropping `q.image` silently).
- **Music**: `scripts/bgm.js` streams `playalidrisi.fun/audio/bgm/hub.mp3` live, same iOS-safe Web-Audio-API unlock pattern as `hub-bgm.js`.
- **Auth**: `scripts/roster.js` — child signs up/in directly with name+PIN (matches al-idrisi-games' hub pattern exactly, no separate parent-account layer — that was tried first and found confusing).
- **Mastery engine**: `scripts/mastery.js` — weightedRand ported from multipleazka (`weight = mastered ? 1 : 1 + wrong*2`, mastered at streak≥5), generalized from per-value to per-topic so one Box can mix subjects. Also tracks shown-question-ids per session so "Play Again" doesn't repeat questions before a topic's pool is exhausted.
- **Drive Mode**: `scripts/drive-mode.js` — same car/dino SVG sprites, collision math, and constants as mathville's Drive Mode, generalized so cities = whatever's in the Box (max 8, capped to match mathville's tuned layout slots) instead of fixed math chapters. World height uses `100dvh`-based calc (not aspect-ratio) — a fixed aspect-ratio cut the top off on phones.
- **Visual**: Sticker Craft design system ported into `styles/style.css` — same palette/fonts/button pattern/decorations/landing-page-with-game-cards layout as the al-idrisi-games hub, hand-copied values (no shared file).
- **AI hint**: `api/generate-hint.js` — exact port of al-idrisi-games' hint endpoint (same model `claude-haiku-4-5`, same prompt), own `ANTHROPIC_API_KEY` set as an encrypted Vercel env var (never in any file).

## Android app (TWA)

Wrapped via Google Bubblewrap (Trusted Web Activity — just displays brainbox.lol in a native shell, no code duplication). Built manually via Node scripts calling `@bubblewrap/core` directly instead of the CLI's interactive prompts (no TTY in this environment).

- Package id: `lol.brainbox.twa`
- **Signing keystore — DO NOT LOSE**: `~/Documents/brain-box-android-keystore/android.keystore`, password in `PASSWORD_KEEP_SAFE.txt` in the same folder. Needed for every future rebuild; losing it means any update requires users to uninstall + reinstall fresh (no in-place update, no Play Store publish continuity).
- Full Android project (for rebuilds): `~/Documents/brain-box-android-keystore/brainbox-android-project/`
- Built APK: `~/Documents/brain-box-android-keystore/brainbox-android-project/brainbox-signed.apk`
- `.well-known/assetlinks.json` (in this repo) verifies the APK's signing fingerprint so the TWA opens full-screen, no Chrome URL bar.
- **Content updates need no rebuild** — the app just displays the live site, so any `git push` + `vercel --prod` is reflected next time the app opens. **APK rebuild only needed for**: app icon/name, splash colors, orientation, min SDK, or other `twa-manifest.json`-level settings.
- Tools installed for this: OpenJDK 17 (`brew install openjdk@17`, at `/opt/homebrew/opt/openjdk@17`), Android SDK cmdline-tools (`brew install --cask android-commandlinetools`, at `/opt/homebrew/share/android-commandlinetools`) — both permanent. Bubblewrap CLI was installed locally via `npm install` in a session scratchpad dir, **not durable** — reinstall with `npm install @bubblewrap/cli` in a fresh dir if rebuilding later.
- To rebuild: regenerate `twa-manifest.json` if settings changed, re-run the Node scaffold script (`TwaGenerator.createTwaProject`), `./gradlew assembleRelease`, then zipalign + `apksigner sign` with the existing keystore. Full recipe is in this session's transcript if needed — ask to recreate the scaffold script.

## iOS app

Not started. Real installable IPA needs the **full Xcode app** (not just Command Line Tools, which is all that's on this Mac currently) — a ~10GB download via Mac App Store requiring the user's own Apple ID login (can't be done by Claude). Once Xcode is installed, plan is Capacitor (wraps brainbox.lol in a native WKWebView shell, same spirit as the Android TWA) — but unlike Android, free Apple ID signing only allows on-device installs via USB that expire every 7 days; a paid Apple Developer Program membership ($99/yr) would be needed for TestFlight-based installs without the USB/7-day dance.

## Gaya kerja user (penting)

- Adit komunikasi campur Indonesia-Inggris, casual.
- **Suka diskusi dulu buat keputusan besar** (arsitektur, model akun, platform native) sebelum eksekusi — tapi buat bug fix/tweak kecil langsung "gas"/perbaiki tanpa banyak tanya.
- Kalau dikasih referensi visual/screenshot dari al-idrisi-games, **samain persis** (warna, layout, spacing dalam px), jangan improvisasi.
- Selalu bump `?v=N` di index.html tiap edit `scripts/*.js` atau `styles/style.css` — kalau lupa, browser (termasuk browser-pane testing) serve versi lama dan bikin bingung "kok belum keupdate".
- Setelah tiap fix, verifikasi di production (`brainbox.lol`) sebelum lapor selesai — screenshot kalau browser-pane approval-nya nyala, DOM/computed-style check kalau kegate.
- Cross-reference `git log` di al-idrisi-games kalau user nanya "apa X di sana ke-reflect ke sini" — jangan asumsi, cek beneran isi commit-nya.
