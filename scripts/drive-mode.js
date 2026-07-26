/* =================================================================
   Brain Box — Drive Mode, generalized cross-subject.

   Ported from mathville's Drive Mode (~/Documents/al-idrisi-games/
   mathville/script.js:469-830) — same car-vs-dino chase, same DOM/CSS
   world (no canvas), same collision math and constants. Two things
   are generalized instead of hardcoded to the 9 math chapters:

   1. Cities = whichever topics are in the child's Box right now (up
      to 8, reusing 8 of the original's 9 tuned, non-overlapping
      layout slots) instead of always exactly the 9 math chapters.
   2. Obstacle hits pull the next question via the SAME weightedRand/
      mastery engine used everywhere else in Brain Box
      (BRAINBOX_MASTERY.pickNextQuestion), across the WHOLE box —
      cross-subject by design, since that's the entire point of the
      Box. Because the content adapter already normalizes every
      source (mathville generators, azkacraft, azkauniverse) into one
      multiple-choice shape up front, Drive Mode never needs
      mathville's buildQuickMc/buildPlaceValueMc synthesis step —
      every question arrives already answerable by tap.

   City collisions award points + a toast (no per-topic mini-screen
   to route to — Brain Box's Box IS the practice pool, there's no
   separate "chapter" screen the way mathville's town map has one).
   ================================================================= */
(function () {
  const DRIVE_SPEED = 0.3888;
  const DINO_SPEED = DRIVE_SPEED * 1.1 * 0.8;
  const DRIVE_DINO_AVOID_RANGE_PX = 55;
  const DRIVE_SCORE_TARGET = 25;
  const DRIVE_MAX_BITES = 3;
  const DRIVE_BITE_COOLDOWN_MS = 3000;
  const DRIVE_BITE_KNOCKBACK = 16;
  const DRIVE_CAR_PX_R = 13.5;
  const DRIVE_OBSTACLE_PX_R = 11;
  const DRIVE_CITY_PX_R = 17;
  const DRIVE_DINO_PX_R = 13;
  const DRIVE_CAR_START = { x: 50, y: 93 };
  const DRIVE_DINO_START = { x: 100 - DRIVE_CAR_START.x, y: 100 - DRIVE_CAR_START.y };
  const DRIVE_CITY_POS = [
    { x: 15, y: 12 }, { x: 50, y: 9 }, { x: 85, y: 14 },
    { x: 12, y: 38 }, { x: 50, y: 40 }, { x: 88, y: 36 },
    { x: 18, y: 64 }, { x: 50, y: 66 }
  ]; // 8 slots (Box cap), dropped the 9th from mathville's original 3x3 grid

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function mount(container, opts) {
    const { boxTopicIds, topicsById, db, childId, statsCache, onExit } = opts;
    const cityTopics = boxTopicIds.map((id) => topicsById.get(id)).filter(Boolean).slice(0, 8);

    container.innerHTML = `
      <div class="bb-drive-hud">
        <span class="bb-drive-score" id="bb-drive-score">⭐ 0/${DRIVE_SCORE_TARGET}</span>
        <span class="bb-drive-lives" id="bb-drive-lives">${"❤️".repeat(DRIVE_MAX_BITES)}</span>
        <button class="sc-btn sc-btn-pink bb-drive-exit" id="bb-drive-exit">✕</button>
      </div>
      <div class="bb-drive-world" id="bb-drive-world">
        <div class="bb-drive-dino" id="bb-drive-dino">🦖</div>
        <div class="bb-drive-car" id="bb-drive-car">🚗</div>
      </div>
      <div class="bb-drive-joystick" id="bb-drive-joystick">
        <div class="bb-drive-joystick-knob" id="bb-drive-joystick-knob"></div>
      </div>
      <div class="bb-drive-question hidden" id="bb-drive-question"></div>
      <div class="bb-drive-end hidden" id="bb-drive-end"></div>
    `;

    const worldEl = container.querySelector("#bb-drive-world");
    const carEl = container.querySelector("#bb-drive-car");
    const dinoEl = container.querySelector("#bb-drive-dino");
    const scoreEl = container.querySelector("#bb-drive-score");
    const livesEl = container.querySelector("#bb-drive-lives");
    const questionEl = container.querySelector("#bb-drive-question");
    const endEl = container.querySelector("#bb-drive-end");
    const joystickEl = container.querySelector("#bb-drive-joystick");
    const knobEl = container.querySelector("#bb-drive-joystick-knob");

    let joyVec = { x: 0, y: 0 };
    let session = { score: 0, bites: 0 };
    let shownIds = new Set(); // reset each new run so "Play Again" doesn't reuse the same questions
    let state = {
      x: DRIVE_CAR_START.x, y: DRIVE_CAR_START.y,
      dino: { x: DRIVE_DINO_START.x, y: DRIVE_DINO_START.y },
      biteCooldownUntil: 0,
      cities: [], obstacles: [], rafId: null, paused: false, worldRect: null, ended: false
    };

    function pxDist(ax, ay, bx, by) {
      const rect = state.worldRect || worldEl.getBoundingClientRect();
      return Math.hypot((ax - bx) / 100 * rect.width, (ay - by) / 100 * rect.height);
    }

    function headingCss(angleRad) { return (angleRad * 180 / Math.PI) + 90; }

    function buildWorld() {
      state.cities = cityTopics.map((topic, i) => ({
        id: topic.id, label: topic.label, emoji: topic.emoji,
        x: DRIVE_CITY_POS[i].x, y: DRIVE_CITY_POS[i].y
      }));

      state.obstacles = [];
      const targetCount = rand(6, 9);
      let guard = 0;
      while (state.obstacles.length < targetCount && guard++ < 300) {
        const cand = { x: rand(6, 94), y: rand(12, 92) };
        const tooCloseToCity = state.cities.some((c) => pxDist(c.x, c.y, cand.x, cand.y) < 40);
        const tooCloseToObstacle = state.obstacles.some((o) => pxDist(o.x, o.y, cand.x, cand.y) < 34);
        const tooCloseToStart = pxDist(DRIVE_CAR_START.x, DRIVE_CAR_START.y, cand.x, cand.y) < 36;
        const tooCloseToDino = pxDist(DRIVE_DINO_START.x, DRIVE_DINO_START.y, cand.x, cand.y) < 36;
        const underJoystick = cand.x < 28 && cand.y > 74;
        if (!tooCloseToCity && !tooCloseToObstacle && !tooCloseToStart && !tooCloseToDino && !underJoystick) {
          state.obstacles.push({ id: "obs" + state.obstacles.length, x: cand.x, y: cand.y });
        }
      }
      renderWorld();
    }

    function renderWorld() {
      worldEl.querySelectorAll(".bb-drive-city, .bb-drive-obstacle").forEach((n) => n.remove());
      state.cities.forEach((c) => {
        const e = document.createElement("div");
        e.className = "bb-drive-city";
        e.style.left = c.x + "%";
        e.style.top = c.y + "%";
        e.innerHTML = `<span>${c.emoji}</span><div class="bb-drive-city-label">${c.label}</div>`;
        worldEl.appendChild(e);
      });
      state.obstacles.forEach((o) => {
        const e = document.createElement("div");
        e.className = "bb-drive-obstacle";
        e.id = "bb-drive-" + o.id;
        e.style.left = o.x + "%";
        e.style.top = o.y + "%";
        e.textContent = "🚧";
        worldEl.appendChild(e);
      });
      carEl.style.left = state.x + "%";
      carEl.style.top = state.y + "%";
    }

    function dinoSteerAngle(dino, desiredAngle, obstacles) {
      const rect = state.worldRect;
      let nearest = null, nearestDist = Infinity;
      for (const o of obstacles) {
        const d = Math.hypot((o.x - dino.x) / 100 * rect.width, (o.y - dino.y) / 100 * rect.height);
        if (d < DRIVE_DINO_AVOID_RANGE_PX && d < nearestDist) { nearest = o; nearestDist = d; }
      }
      if (!nearest) return desiredAngle;
      const toObstacle = Math.atan2(nearest.y - dino.y, nearest.x - dino.x);
      const diff = Math.atan2(Math.sin(toObstacle - desiredAngle), Math.cos(toObstacle - desiredAngle));
      if (Math.abs(diff) > Math.PI / 2.2) return desiredAngle;
      const avoidStrength = (DRIVE_DINO_AVOID_RANGE_PX - nearestDist) / DRIVE_DINO_AVOID_RANGE_PX;
      const turn = diff >= 0 ? -1 : 1;
      return desiredAngle + turn * (Math.PI / 3) * avoidStrength;
    }

    function awardScore(points) {
      session.score = Math.min(DRIVE_SCORE_TARGET, session.score + points);
      scoreEl.textContent = `⭐ ${session.score}/${DRIVE_SCORE_TARGET}`;
      return session.score >= DRIVE_SCORE_TARGET;
    }

    function checkCollisions() {
      for (const c of state.cities) {
        if (pxDist(c.x, c.y, state.x, state.y) < DRIVE_CAR_PX_R + DRIVE_CITY_PX_R) {
          state.cities = state.cities.filter((x) => x !== c);
          renderWorld();
          toast(`${c.emoji} ${c.label} visited!`);
          if (awardScore(10)) { showEnd(true); return; }
          return;
        }
      }
      for (const o of state.obstacles) {
        if (pxDist(o.x, o.y, state.x, state.y) < DRIVE_CAR_PX_R + DRIVE_OBSTACLE_PX_R) {
          state.obstacles = state.obstacles.filter((x) => x !== o);
          const el = document.getElementById("bb-drive-" + o.id);
          if (el) el.remove();
          if (awardScore(1)) { showEnd(true); return; }
          showQuestion();
          return;
        }
      }
      const now = performance.now();
      if (now >= state.biteCooldownUntil &&
          pxDist(state.dino.x, state.dino.y, state.x, state.y) < DRIVE_CAR_PX_R + DRIVE_DINO_PX_R) {
        state.biteCooldownUntil = now + DRIVE_BITE_COOLDOWN_MS;
        session.bites++;
        livesEl.textContent = "❤️".repeat(DRIVE_MAX_BITES - session.bites) + "🖤".repeat(session.bites);
        carEl.classList.add("bitten");
        setTimeout(() => carEl.classList.remove("bitten"), DRIVE_BITE_COOLDOWN_MS);
        const kAngle = Math.atan2(state.dino.y - state.y, state.dino.x - state.x);
        state.dino.x = Math.max(0, Math.min(100, state.dino.x + Math.cos(kAngle) * DRIVE_BITE_KNOCKBACK));
        state.dino.y = Math.max(0, Math.min(100, state.dino.y + Math.sin(kAngle) * DRIVE_BITE_KNOCKBACK));
        const livesLeft = DRIVE_MAX_BITES - session.bites;
        if (livesLeft > 0) toast(`Bitten! ${livesLeft} ${livesLeft === 1 ? "life" : "lives"} left`);
        if (session.bites >= DRIVE_MAX_BITES) showEnd(false);
      }
    }

    function toast(msg) {
      const t = document.createElement("div");
      t.className = "bb-drive-toast";
      t.textContent = msg;
      worldEl.appendChild(t);
      setTimeout(() => t.remove(), 1300);
    }

    function showQuestion() {
      state.paused = true;
      const picked = window.BRAINBOX_MASTERY.pickNextQuestion(boxTopicIds, topicsById, statsCache, shownIds);
      if (!picked) { state.paused = false; return; }
      shownIds.add(picked.question.id);
      const { question, topic } = picked;
      questionEl.classList.remove("hidden");
      questionEl.innerHTML = `
        <div class="sc-panel bb-drive-question-card">
          <div class="sc-field-label">${topic.emoji} ${topic.label}</div>
          <div class="bb-drive-question-prompt">${question.prompt}</div>
          <div class="bb-drive-question-options"></div>
        </div>
      `;
      const optionsEl = questionEl.querySelector(".bb-drive-question-options");
      question.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "sc-btn sc-btn-secondary";
        btn.textContent = opt;
        btn.onclick = () => {
          const isCorrect = opt === question.answer;
          optionsEl.querySelectorAll("button").forEach((b) => (b.disabled = true));
          btn.classList.add(isCorrect ? "bb-correct" : "bb-wrong");
          window.BRAINBOX_MASTERY.recordAnswer(db, childId, topic.id, isCorrect, statsCache);
          setTimeout(() => {
            questionEl.classList.add("hidden");
            state.paused = false;
          }, 900);
        };
        optionsEl.appendChild(btn);
      });
    }

    function showEnd(won) {
      state.ended = true;
      state.paused = true;
      cancelAnimationFrame(state.rafId);
      endEl.classList.remove("hidden");
      endEl.innerHTML = `
        <div class="sc-panel bb-drive-end-card">
          <div class="bb-drive-end-emoji">${won ? "🏆" : "🦖"}</div>
          <div class="sc-screen-title">${won ? "You did it!" : "Caught by the dino 3x!"}</div>
          <div class="sc-subtitle">${won ? `${DRIVE_SCORE_TARGET} points reached — great job!` : "Give it another go!"}</div>
          <button class="sc-btn" id="bb-drive-again">Play Again</button>
          <button class="sc-btn sc-btn-secondary" id="bb-drive-exit-end">Exit</button>
        </div>
      `;
      endEl.querySelector("#bb-drive-again").onclick = () => { endEl.classList.add("hidden"); reset(); };
      endEl.querySelector("#bb-drive-exit-end").onclick = () => onExit && onExit();
    }

    function frame() {
      if (state.ended) return;
      if (!state.paused) {
        const mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
        if (mag > 0.05) {
          const angle = Math.atan2(joyVec.y, joyVec.x);
          state.x = Math.max(0, Math.min(100, state.x + Math.cos(angle) * DRIVE_SPEED * mag));
          state.y = Math.max(0, Math.min(100, state.y + Math.sin(angle) * DRIVE_SPEED * mag));
          carEl.style.left = state.x + "%";
          carEl.style.top = state.y + "%";
          carEl.style.transform = `rotate(${headingCss(angle)}deg)`;
        }
        const dx = state.x - state.dino.x, dy = state.y - state.dino.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          const dAngle = dinoSteerAngle(state.dino, Math.atan2(dy, dx), state.obstacles);
          const step = Math.min(dist, DINO_SPEED);
          state.dino.x = Math.max(0, Math.min(100, state.dino.x + Math.cos(dAngle) * step));
          state.dino.y = Math.max(0, Math.min(100, state.dino.y + Math.sin(dAngle) * step));
          dinoEl.style.left = state.dino.x + "%";
          dinoEl.style.top = state.dino.y + "%";
          dinoEl.style.transform = `rotate(${headingCss(dAngle)}deg)`;
        }
        checkCollisions();
      }
      state.rafId = requestAnimationFrame(frame);
    }

    // Joystick — Pointer Events so it works on touch (iOS Safari) and mouse alike.
    function wireJoystick() {
      const radius = 40;
      let active = false;
      function setVec(dx, dy) {
        const mag = Math.min(1, Math.hypot(dx, dy) / radius);
        const angle = Math.atan2(dy, dx);
        joyVec = { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
        knobEl.style.transform = `translate(${Math.cos(angle) * mag * radius}px, ${Math.sin(angle) * mag * radius}px)`;
      }
      joystickEl.addEventListener("pointerdown", (e) => {
        active = true;
        joystickEl.setPointerCapture(e.pointerId);
      });
      joystickEl.addEventListener("pointermove", (e) => {
        if (!active) return;
        const rect = joystickEl.getBoundingClientRect();
        setVec(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
      });
      function release() {
        active = false;
        joyVec = { x: 0, y: 0 };
        knobEl.style.transform = "translate(0, 0)";
      }
      joystickEl.addEventListener("pointerup", release);
      joystickEl.addEventListener("pointercancel", release);
    }

    function reset() {
      session = { score: 0, bites: 0 };
      shownIds = new Set();
      state = {
        x: DRIVE_CAR_START.x, y: DRIVE_CAR_START.y,
        dino: { x: DRIVE_DINO_START.x, y: DRIVE_DINO_START.y },
        biteCooldownUntil: 0,
        cities: [], obstacles: [], rafId: null, paused: false, worldRect: null, ended: false
      };
      scoreEl.textContent = `⭐ 0/${DRIVE_SCORE_TARGET}`;
      livesEl.textContent = "❤️".repeat(DRIVE_MAX_BITES);
      state.worldRect = worldEl.getBoundingClientRect();
      buildWorld();
      state.rafId = requestAnimationFrame(frame);
    }

    container.querySelector("#bb-drive-exit").onclick = () => {
      cancelAnimationFrame(state.rafId);
      onExit && onExit();
    };

    wireJoystick();
    requestAnimationFrame(() => reset());
  }

  window.BRAINBOX_DRIVE = { mount, DRIVE_SCORE_TARGET: DRIVE_SCORE_TARGET };
})();
