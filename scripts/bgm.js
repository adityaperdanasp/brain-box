/* Brain Box — background music. Same track as al-idrisi-games/hub-bgm.js,
   streamed live from playalidrisi.fun (same public-asset approach as the
   question content in content-loader.js) instead of a copied local file.

   Volume: plain <audio>.volume works fine everywhere EXCEPT iOS Safari,
   which silently ignores it (only the hardware buttons change loudness
   there) — a Web Audio API GainNode is the only way volume actually
   changes on iPhone. So: set .volume directly as the baseline (covers
   Android/desktop/everything else), and layer the GainNode graph on top
   only as an iOS enhancement — wrapped in its own try/catch so if IT
   fails (e.g. a CORS/WebView quirk), playback still starts via the plain
   .play() call instead of the whole function silently aborting before
   ever reaching it. That was the actual bug on Android: the graph setup
   threw, so track.play() never ran at all. */
(function () {
  const VOLUME = 0.30;
  const FADE_MS = 400;

  const track = new Audio("https://playalidrisi.fun/audio/bgm/hub.mp3");
  track.loop = true;
  track.preload = "auto";
  track.crossOrigin = "anonymous";
  track.volume = VOLUME;

  let ctx = null;
  let gain = null;
  let unlocked = false;

  function ensureAudioGraph() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(track);
    gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(ctx.destination);
  }

  function fadeIn() {
    if (!gain || !ctx) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(VOLUME, now + FADE_MS / 1000);
  }

  // iOS Safari sometimes leaves the AudioContext stuck "suspended" even
  // after resume() is called from inside a gesture handler — playing one
  // frame of silence forces Safari to actually start the audio clock.
  function kickAudioContext() {
    if (!ctx) return;
    ctx.resume();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  function unlockOnce() {
    // Enhancement only — must never block track.play() below from running.
    try {
      ensureAudioGraph();
      kickAudioContext();
    } catch (err) {
      console.warn("[bgm] Web Audio graph unavailable, using plain <audio> volume instead:", err);
    }

    if (unlocked) return;
    unlocked = true;
    track.play().then(() => { if (gain) fadeIn(); }).catch((err) => {
      console.warn("[bgm] playback blocked:", err);
      unlocked = false; // let the next tap retry instead of giving up for the whole session
    });
  }

  // Not one-time-only — ctx.resume() can fail silently on iOS Safari, and
  // track.play() itself can reject on a given tap (autoplay heuristics,
  // a transient network hiccup on the first gesture, etc.) — every
  // subsequent tap gets a chance to retry (unlockOnce() resets `unlocked`
  // back to false on failure specifically so this isn't a one-shot gate
  // that permanently silences the whole session after one bad attempt).
  ["pointerdown", "touchend", "click", "keydown"].forEach((evt) =>
    document.addEventListener(evt, unlockOnce, { passive: true })
  );
})();
