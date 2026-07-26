/* Brain Box — background music. Same track and same iOS-safe unlock
   pattern as al-idrisi-games/hub-bgm.js, streamed live from
   playalidrisi.fun (same public-asset approach as the question content
   in content-loader.js) instead of a copied local file.

   Volume goes through the Web Audio API (GainNode), not the <audio>
   element's own .volume — iOS Safari ignores that property entirely
   (only the hardware volume buttons change loudness), so a GainNode is
   the only way volume actually changes on iPhone. */
(function () {
  const VOLUME = 0.30;
  const FADE_MS = 400;

  const track = new Audio("https://playalidrisi.fun/audio/bgm/hub.mp3");
  track.loop = true;
  track.preload = "auto";
  track.crossOrigin = "anonymous";

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
    ensureAudioGraph();
    kickAudioContext();

    if (unlocked) return;
    unlocked = true;
    track.play().then(fadeIn).catch((err) => console.warn("[bgm] playback blocked:", err));
  }

  // Not one-time-only — ctx.resume() can fail silently on iOS Safari, so
  // every subsequent tap gets a chance to retry (unlockOnce() itself still
  // only starts playback once, via the `unlocked` flag).
  ["pointerdown", "touchend", "click", "keydown"].forEach((evt) =>
    document.addEventListener(evt, unlockOnce, { passive: true })
  );
})();
