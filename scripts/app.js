/* Brain Box — screen glue. Loads content once, wires auth (child signs up
   or in directly, matching al-idrisi-games' hub pattern) -> menu ->
   box/practice/drive screens together. */
(function () {
  const db = window.BB_DB;
  let allTopics = [];
  let topicsById = new Map();
  let statsCache = {};
  let activeChild = null; // { key, name, box: [topicId,...] }

  function $(id) { return document.getElementById(id); }

  function showScreen(id) {
    document.querySelectorAll(".sc-screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
    // Android WebView (inside the TWA) has occasionally left stale pixels
    // from the screen just hidden visibly overlapping the new one — a
    // compositing/paint glitch, not a real display:none failure. Forcing
    // a synchronous reflow on the next frame reliably clears it.
    requestAnimationFrame(() => { void document.body.offsetHeight; });
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.add("visible");
  }
  function clearError(el) {
    el.classList.remove("visible");
  }

  /* ---- Auth screen ---- */
  const AUTH_SUBMIT_LABEL = { signup: "Register here 🚀", signin: "Let's Play 🚀" };

  function wireAuthScreen() {
    document.querySelectorAll(".sc-auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".sc-auth-tab").forEach((t) => t.classList.toggle("active", t === tab));
        $("bb-auth-submit").textContent = AUTH_SUBMIT_LABEL[tab.dataset.mode];
      });
    });

    $("bb-auth-submit").addEventListener("click", async () => {
      const mode = document.querySelector(".sc-auth-tab.active").dataset.mode;
      const name = $("bb-auth-name").value.trim();
      const pin = $("bb-auth-pin").value.trim();
      const errEl = $("bb-auth-error");
      clearError(errEl);
      try {
        const child = mode === "signup"
          ? await window.BRAINBOX_ROSTER.signUpChild(db, name, pin)
          : await window.BRAINBOX_ROSTER.signInChild(db, name, pin);
        await enterMenu(child);
      } catch (e) {
        showError(errEl, e.message);
      }
    });

    $("bb-auth-pin").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("bb-auth-submit").click();
    });
  }

  /* ---- Menu screen — same avatar-color-hash + bobbing-greeting pattern
     as al-idrisi-games' hub (index.html:245-259, 337-375). ---- */
  const SC_STUDENT_PALETTE = ["#F6C1C1", "#C1E1C1", "#C1D4F6", "#F6E3B4", "#D9C1F6", "#F6C1E0", "#C1F0E8"];
  const SC_GREETING_COLORS = ["blue", "pink", "green"];
  const SC_GREETINGS = [
    "Keep up the great work, {name}!",
    "Ready for another adventure, {name}?",
    "You're doing awesome, {name}!",
    "Let's learn something new today, {name}!",
    "{name}, your streak is looking great!"
  ];

  function colorFor(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return SC_STUDENT_PALETTE[hash % SC_STUDENT_PALETTE.length];
  }

  function renderGreeting(name) {
    const dayIndex = Math.floor(Date.now() / 86400000) % SC_GREETINGS.length;
    const nameColor = SC_GREETING_COLORS[dayIndex % SC_GREETING_COLORS.length];
    const nameHtml = `<span class="sc-greeting-name ${nameColor}">${name}</span>`;
    const words = ["🌟", ...SC_GREETINGS[dayIndex].split(" ").map((w) => w.replace("{name}", nameHtml))];
    $("bb-menu-greeting").innerHTML = words
      .map((w, i) => `<span class="sc-greeting-word" style="animation-delay:${i * 0.12}s">${w}</span>`)
      .join(" ");
  }

  async function enterMenu(child) {
    activeChild = child;
    statsCache = await window.BRAINBOX_MASTERY.loadStats(db, child.key);
    $("bb-menu-avatar").style.background = colorFor(child.key);
    $("bb-menu-avatar").textContent = child.name[0].toUpperCase();
    $("bb-menu-name").textContent = child.name;
    $("bb-menu-box-count").textContent = `${(child.box || []).length} / ${window.BRAINBOX_BOX.MAX_BOX_TOPICS} topics in the Box`;
    renderGreeting(child.name);
    showScreen("bb-screen-menu");
  }

  function wireMenuScreen() {
    $("bb-menu-box-btn").onclick = () => enterBoxScreen();
    $("bb-menu-practice-btn").onclick = () => enterPracticeScreen();
    $("bb-menu-drive-btn").onclick = () => enterDriveScreen();
    $("bb-menu-logout").onclick = () => {
      window.BRAINBOX_ROSTER.clearChild();
      activeChild = null;
      $("bb-auth-name").value = "";
      $("bb-auth-pin").value = "";
      showScreen("bb-screen-auth");
    };
  }

  /* ---- Box screen ---- */
  function enterBoxScreen() {
    showScreen("bb-screen-box");
    const container = $("bb-box-container");
    window.BRAINBOX_BOX.mount(container, {
      topics: allTopics,
      initialBoxTopicIds: activeChild.box || [],
      onChange: (boxIds) => {
        activeChild.box = boxIds;
        db.ref(`children/${activeChild.key}/box`).set(boxIds);
      }
    });
  }
  function wireBoxScreen() {
    $("bb-box-done-btn").onclick = () => enterMenu(activeChild);
  }

  /* ---- Practice screen ---- */
  function enterPracticeScreen() {
    showScreen("bb-screen-practice");
    window.BRAINBOX_PRACTICE.mount($("bb-practice-container"), {
      boxTopicIds: activeChild.box || [],
      topicsById,
      db,
      childId: activeChild.key,
      childName: activeChild.name,
      statsCache,
      onExit: () => enterMenu(activeChild)
    });
  }

  /* ---- Drive screen ---- */
  function enterDriveScreen() {
    showScreen("bb-screen-drive");
    window.BRAINBOX_DRIVE.mount($("bb-drive-container"), {
      boxTopicIds: activeChild.box || [],
      topicsById,
      db,
      childId: activeChild.key,
      childName: activeChild.name,
      statsCache,
      onExit: () => enterMenu(activeChild)
    });
  }

  async function boot() {
    wireAuthScreen();
    wireMenuScreen();
    wireBoxScreen();

    const { topics, byId } = await window.BRAINBOX_CONTENT.loadAllTopics();
    allTopics = topics;
    topicsById = byId;

    const savedChild = window.BRAINBOX_ROSTER.getChild();
    if (savedChild) {
      try {
        const snap = await db.ref(`children/${savedChild.key}`).get();
        if (snap.exists()) {
          enterMenu({ key: savedChild.key, ...snap.val() });
        } else {
          window.BRAINBOX_ROSTER.clearChild();
          showScreen("bb-screen-auth");
        }
      } catch (e) {
        enterMenu(savedChild); // Firebase unreachable — fail open like al-idrisi does
      }
    } else {
      showScreen("bb-screen-auth");
    }
  }

  boot();
})();
