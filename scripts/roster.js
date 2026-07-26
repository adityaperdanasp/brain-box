/* =================================================================
   Brain Box — parent accounts + multi-child roster.

   Same low-friction pattern as the al-idrisi hub's Sign Up/Sign In
   (~/Documents/al-idrisi-games/index.html:560-592): name + 4-digit PIN,
   stored in Firebase, no real auth provider — fine for a family/small
   trusted group, not meant to hold sensitive data.

   New here (the old hub had a hardcoded roster in players.js): a parent
   can have MULTIPLE children, added freely from the UI, each with their
   own Box (topic selection) and topicStats. Schema (Brain Box's own
   Firebase project):
     parents/{parentKey}                = { name, pin, createdAt }
     parents/{parentKey}/children/{key} = true   (index of this parent's kids)
     children/{childKey}                = { name, parentKey, createdAt, box: [topicId,...] }
     children/{childKey}/topicStats/{topicId} = { correct, wrong, streak, lastWrongAt }
   childKey is "{parentKey}__{sanitized child name}" so two different
   parents can each have a child with the same first name.

   listChildren looks up parents/{parentKey}/children (a plain key list)
   and fetches each child by direct key, instead of querying `children`
   with orderByChild("parentKey") — an unindexed query on that path
   throws "Index not defined" against Realtime Database's default rules,
   and fixing it would mean asking Adit to hand-edit the security rules
   in the Firebase console. Direct-key lookups need no index at all.
   ================================================================= */
(function () {
  const PARENT_KEY = "bb_parent";
  const ACTIVE_CHILD_KEY = "bb_active_child";

  function sanitizeNameKey(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function getParent() {
    try {
      const raw = localStorage.getItem(PARENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setParent(parent) {
    localStorage.setItem(PARENT_KEY, JSON.stringify(parent));
  }

  function clearParent() {
    localStorage.removeItem(PARENT_KEY);
    localStorage.removeItem(ACTIVE_CHILD_KEY);
  }

  function getActiveChild() {
    try {
      const raw = localStorage.getItem(ACTIVE_CHILD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setActiveChild(child) {
    localStorage.setItem(ACTIVE_CHILD_KEY, JSON.stringify(child));
  }

  function clearActiveChild() {
    localStorage.removeItem(ACTIVE_CHILD_KEY);
  }

  async function signUpParent(db, rawName, pin) {
    const key = sanitizeNameKey(rawName);
    if (!key) throw new Error("Enter your name");
    if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
    const snap = await db.ref(`parents/${key}`).get();
    if (snap.exists()) throw new Error("This name is already taken");
    await db.ref(`parents/${key}`).set({ name: rawName, pin, createdAt: Date.now() });
    const parent = { key, name: rawName };
    setParent(parent);
    return parent;
  }

  async function signInParent(db, rawName, pin) {
    const key = sanitizeNameKey(rawName);
    if (!key) throw new Error("Enter your name");
    const snap = await db.ref(`parents/${key}`).get();
    const existing = snap.exists() ? snap.val() : null;
    if (!existing || existing.pin !== pin) throw new Error("Name or PIN is incorrect");
    const parent = { key, name: existing.name };
    setParent(parent);
    return parent;
  }

  async function addChild(db, parentKey, rawName) {
    const childKey = `${parentKey}__${sanitizeNameKey(rawName)}`;
    if (!sanitizeNameKey(rawName)) throw new Error("Enter a name");
    const snap = await db.ref(`children/${childKey}`).get();
    if (snap.exists()) throw new Error("This child is already added");
    await db.ref(`children/${childKey}`).set({
      name: rawName,
      parentKey,
      createdAt: Date.now(),
      box: []
    });
    await db.ref(`parents/${parentKey}/children/${childKey}`).set(true);
    return { key: childKey, name: rawName, box: [] };
  }

  async function listChildren(db, parentKey) {
    const indexSnap = await db.ref(`parents/${parentKey}/children`).get();
    if (!indexSnap.exists()) return [];
    const childKeys = Object.keys(indexSnap.val());
    const childSnaps = await Promise.all(childKeys.map((key) => db.ref(`children/${key}`).get()));
    return childSnaps
      .map((snap, i) => (snap.exists() ? { key: childKeys[i], ...snap.val() } : null))
      .filter(Boolean);
  }

  window.BRAINBOX_ROSTER = {
    getParent,
    setParent,
    clearParent,
    getActiveChild,
    setActiveChild,
    clearActiveChild,
    signUpParent,
    signInParent,
    addChild,
    listChildren,
    sanitizeNameKey
  };
})();
