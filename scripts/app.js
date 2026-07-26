/* Brain Box — screen glue. Loads content once, wires auth -> children ->
   menu -> box/practice/drive screens together. */
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
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.add("visible");
  }
  function clearError(el) {
    el.classList.remove("visible");
  }

  /* ---- Auth screen ---- */
  function wireAuthScreen() {
    document.querySelectorAll(".sc-auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".sc-auth-tab").forEach((t) => t.classList.toggle("active", t === tab));
      });
    });

    $("bb-auth-submit").addEventListener("click", async () => {
      const mode = document.querySelector(".sc-auth-tab.active").dataset.mode;
      const name = $("bb-auth-name").value.trim();
      const pin = $("bb-auth-pin").value.trim();
      const errEl = $("bb-auth-error");
      clearError(errEl);
      try {
        const parent = mode === "signup"
          ? await window.BRAINBOX_ROSTER.signUpParent(db, name, pin)
          : await window.BRAINBOX_ROSTER.signInParent(db, name, pin);
        await enterChildrenScreen(parent);
      } catch (e) {
        showError(errEl, e.message);
      }
    });
  }

  /* ---- Children screen ---- */
  async function enterChildrenScreen(parent) {
    const children = await window.BRAINBOX_ROSTER.listChildren(db, parent.key);
    renderChildrenList(parent, children);
    showScreen("bb-screen-children");
  }

  function renderChildrenList(parent, children) {
    $("bb-children-title").textContent = `Hi, ${parent.name}! Pick a child`;
    const listEl = $("bb-children-list");
    listEl.innerHTML = "";
    children.forEach((child) => {
      const card = document.createElement("button");
      card.className = "sc-chip bb-child-card";
      card.textContent = child.name;
      card.onclick = () => enterMenu(child);
      listEl.appendChild(card);
    });

    const formEl = $("bb-add-child-form");
    const nameInput = $("bb-add-child-name");
    const errEl = $("bb-add-child-error");

    $("bb-add-child-btn").onclick = () => {
      formEl.style.display = "flex";
      $("bb-add-child-btn").style.display = "none";
      nameInput.value = "";
      clearError(errEl);
      nameInput.focus();
    };
    $("bb-add-child-cancel").onclick = () => {
      formEl.style.display = "none";
      $("bb-add-child-btn").style.display = "block";
    };
    $("bb-add-child-confirm").onclick = async () => {
      const name = nameInput.value.trim();
      clearError(errEl);
      if (!name) { showError(errEl, "Enter a name"); return; }
      try {
        const child = await window.BRAINBOX_ROSTER.addChild(db, parent.key, name);
        children.push(child);
        renderChildrenList(parent, children); // re-renders with the form collapsed again
      } catch (e) {
        showError(errEl, e.message);
      }
    };
    formEl.style.display = "none";
    $("bb-add-child-btn").style.display = "block";
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("bb-add-child-confirm").click();
    });

    $("bb-signout-btn").onclick = () => {
      window.BRAINBOX_ROSTER.clearParent();
      showScreen("bb-screen-auth");
    };
  }

  /* ---- Menu screen ---- */
  async function enterMenu(child) {
    activeChild = child;
    window.BRAINBOX_ROSTER.setActiveChild({ key: child.key, name: child.name });
    statsCache = await window.BRAINBOX_MASTERY.loadStats(db, child.key);
    $("bb-menu-title").textContent = `${child.name}'s Brain Box`;
    $("bb-menu-box-count").textContent = `${(child.box || []).length} / ${window.BRAINBOX_BOX.MAX_BOX_TOPICS} topics in the Box`;
    showScreen("bb-screen-menu");
  }

  function wireMenuScreen() {
    $("bb-menu-box-btn").onclick = () => enterBoxScreen();
    $("bb-menu-practice-btn").onclick = () => enterPracticeScreen();
    $("bb-menu-drive-btn").onclick = () => enterDriveScreen();
    $("bb-menu-switch-btn").onclick = () => {
      const parent = window.BRAINBOX_ROSTER.getParent();
      enterChildrenScreen(parent);
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

    const parent = window.BRAINBOX_ROSTER.getParent();
    if (parent) {
      const activeChildRef = window.BRAINBOX_ROSTER.getActiveChild();
      const children = await window.BRAINBOX_ROSTER.listChildren(db, parent.key);
      if (activeChildRef && children.some((c) => c.key === activeChildRef.key)) {
        enterMenu(children.find((c) => c.key === activeChildRef.key));
      } else {
        renderChildrenList(parent, children);
        showScreen("bb-screen-children");
      }
    } else {
      showScreen("bb-screen-auth");
    }
  }

  boot();
})();
