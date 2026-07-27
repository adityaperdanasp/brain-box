/* =================================================================
   Brain Box — voice cheering.

   Reuses azkacraft's pre-recorded ElevenLabs clips live from
   playalidrisi.fun (same live-fetch approach as content-loader.js and
   bgm.js) instead of calling the ElevenLabs API at runtime or hosting
   a duplicate copy — playing a line never costs credits.

   Brain Box's Sign Up takes ANY typed name (no fixed roster, unlike
   al-idrisi-games), so only names that match al-idrisi-games' actual
   Grade 4 roster have a recorded name-splice clip available. Everyone
   else gets the generic (name-less) praise/encourage clips. Falls back
   to the browser's SpeechSynthesis API if a clip fails to load/play.
   ================================================================= */
(function () {
  const BASE = "https://playalidrisi.fun/azkacraft/audio";
  const PRAISE_CLIP_COUNT = 40;
  const ENCOURAGE_CLIP_COUNT = 25;
  const NAME_FIRST_COUNT = { praise: 25, encourage: 15 };
  const PERSONAL_PRAISE_COUNT = 3;
  const PRAISE_POOL_SIZE = PERSONAL_PRAISE_COUNT + PRAISE_CLIP_COUNT;
  const AZKA_ORIGINAL_COUNT = { praise: 20, encourage: 20 };

  // Names with a recorded audio/names/{id}.mp3 + 3 praise-personal clips
  // in al-idrisi-games (azkacraft's actual Grade 4 class roster). Azka is
  // handled separately below (his own fully-recorded, non-spliced set).
  const KNOWN_NAMES = new Set([
    "aikara", "alesha", "annisa", "anya", "arsya", "aysha", "bram", "enzo",
    "euis", "hana", "india", "izzan", "kaisa", "kala", "kimikeira", "kinan",
    "ludens", "maisa", "nara", "neil", "rachel", "rigel", "skyela", "sofhie",
    "tareq"
  ]);

  function randomClipNumber(count) {
    return String(Math.floor(Math.random() * count) + 1).padStart(2, "0");
  }

  function speakWithBrowser(text) {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.pitch = 1.15;
    utter.rate = 1.0;
    utter.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find((v) => /female|samantha|victoria|karen|moira|tessa|zira/i.test(v.name));
    if (femaleVoice) utter.voice = femaleVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function playAzkaOriginal(kind, fallbackText) {
    const n = randomClipNumber(AZKA_ORIGINAL_COUNT[kind]);
    const audio = new Audio(`${BASE}/azka-original/${kind}/${kind}-${n}.mp3`);
    audio.play().catch((err) => {
      console.warn("[voice] clip failed, falling back to browser voice:", err);
      speakWithBrowser(fallbackText);
    });
  }

  // Chains the name clip with the praise/encourage line, in whichever
  // order this clip number is phrased for (mixed for variety, same as
  // azkacraft). If a clip is missing/fails, skips straight to whatever's
  // left so playback still works, just without the name.
  function playNamedClip(kind, nameKey, num, url, fallbackText) {
    const line = new Audio(url);
    const nameClip = new Audio(`${BASE}/names/${nameKey}.mp3`);
    const nameFirst = Number(num) <= NAME_FIRST_COUNT[kind];
    const playLine = () => {
      line.play().catch((err) => {
        console.warn("[voice] clip failed, falling back to browser voice:", err);
        speakWithBrowser(fallbackText);
      });
    };
    if (nameFirst) {
      nameClip.addEventListener("ended", playLine);
      nameClip.addEventListener("error", playLine);
      nameClip.play().catch(playLine);
    } else {
      line.addEventListener("ended", () => nameClip.play().catch(() => {}));
      line.addEventListener("error", () => speakWithBrowser(fallbackText));
      line.play().catch(() => speakWithBrowser(fallbackText));
    }
  }

  function playGenericClip(kind, fallbackText) {
    const count = kind === "praise" ? PRAISE_CLIP_COUNT : ENCOURAGE_CLIP_COUNT;
    const n = randomClipNumber(count);
    const audio = new Audio(`${BASE}/${kind}/${kind}-${n}.mp3`);
    audio.play().catch((err) => {
      console.warn("[voice] clip failed, falling back to browser voice:", err);
      speakWithBrowser(fallbackText);
    });
  }

  function nameKeyFor(name) {
    return window.BRAINBOX_ROSTER ? window.BRAINBOX_ROSTER.sanitizeNameKey(name) : "";
  }

  function speakPraise(name) {
    if (window.BRAINBOX_BGM) window.BRAINBOX_BGM.duck(2600);
    const nameKey = nameKeyFor(name);
    const fallback = `Amazing job, ${name}! You got it!`;

    if (nameKey === "azka") return playAzkaOriginal("praise", fallback);

    if (KNOWN_NAMES.has(nameKey)) {
      const poolNum = Math.floor(Math.random() * PRAISE_POOL_SIZE) + 1;
      if (poolNum <= PERSONAL_PRAISE_COUNT) {
        const n = String(poolNum).padStart(2, "0");
        const audio = new Audio(`${BASE}/praise-personal/${nameKey}-${n}.mp3`);
        audio.play().catch((err) => {
          console.warn("[voice] clip failed, falling back to browser voice:", err);
          speakWithBrowser(fallback);
        });
        return;
      }
      const n2 = String(poolNum - PERSONAL_PRAISE_COUNT).padStart(2, "0");
      return playNamedClip("praise", nameKey, n2, `${BASE}/praise/praise-${n2}.mp3`, fallback);
    }

    playGenericClip("praise", fallback);
  }

  function speakEncouragement(name) {
    if (window.BRAINBOX_BGM) window.BRAINBOX_BGM.duck(2600);
    const nameKey = nameKeyFor(name);
    const fallback = `Nice try, ${name}! Let's keep going!`;

    if (nameKey === "azka") return playAzkaOriginal("encourage", fallback);
    if (KNOWN_NAMES.has(nameKey)) {
      const n = randomClipNumber(ENCOURAGE_CLIP_COUNT);
      return playNamedClip("encourage", nameKey, n, `${BASE}/encourage/encourage-${n}.mp3`, fallback);
    }

    playGenericClip("encourage", fallback);
  }

  window.BRAINBOX_VOICE = { speakPraise, speakEncouragement };
})();
