/* =================================================================
   Brain Box — child accounts.

   Matches al-idrisi-games' hub pattern exactly
   (~/Documents/al-idrisi-games/index.html:560-592): each CHILD signs
   up directly with name + 4-digit PIN, stored in Firebase — no
   separate "parent account" layer. A parent operating the device
   doesn't need their own login; multi-child support just means
   whichever child's name+PIN is entered becomes the active profile
   on this device ("Switch Child" clears it so a different kid can
   sign in). This replaced an earlier two-layer parent-then-child
   design that tested confusing — see git history for that version.

   Schema (Brain Box's own Firebase project):
     children/{childKey} = { name, pin, createdAt, box: [topicId,...] }
     children/{childKey}/topicStats/{topicId} = { correct, wrong, streak, lastWrongAt }
   ================================================================= */
(function () {
  const ACTIVE_CHILD_KEY = "bb_child";

  function sanitizeNameKey(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function getChild() {
    try {
      const raw = localStorage.getItem(ACTIVE_CHILD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setChild(child) {
    localStorage.setItem(ACTIVE_CHILD_KEY, JSON.stringify(child));
  }

  function clearChild() {
    localStorage.removeItem(ACTIVE_CHILD_KEY);
  }

  async function signUpChild(db, rawName, pin) {
    const key = sanitizeNameKey(rawName);
    if (!key) throw new Error("Enter your name");
    if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
    const snap = await db.ref(`children/${key}`).get();
    if (snap.exists()) throw new Error("This name is already taken");
    await db.ref(`children/${key}`).set({ name: rawName, pin, createdAt: Date.now(), box: [] });
    const child = { key, name: rawName, box: [] };
    setChild(child);
    return child;
  }

  async function signInChild(db, rawName, pin) {
    const key = sanitizeNameKey(rawName);
    if (!key) throw new Error("Enter your name");
    const snap = await db.ref(`children/${key}`).get();
    const existing = snap.exists() ? snap.val() : null;
    if (!existing || existing.pin !== pin) throw new Error("Name or PIN is incorrect");
    const child = { key, name: existing.name, box: existing.box || [] };
    setChild(child);
    return child;
  }

  window.BRAINBOX_ROSTER = {
    getChild,
    setChild,
    clearChild,
    signUpChild,
    signInChild,
    sanitizeNameKey
  };
})();
