/* =================================================================
   Brain Box — practice session (non-Drive Mode): a plain sequence of
   mixed-subject MC questions pulled from the child's Box via the
   mastery engine, 10 per session. Wrong answers get an AI Tutor hint
   (same contract as al-idrisi-games' /api/generate-hint — silently
   hidden on any failure, never blocks moving on).
   ================================================================= */
(function () {
  const SESSION_LENGTH = 10;

  function mount(container, opts) {
    const { boxTopicIds, topicsById, db, childId, childName, statsCache, onExit } = opts;
    let index = 0;
    let correctCount = 0;
    let shownIds = new Set(); // reset each new session so "Play Again" doesn't reuse the last round's questions

    function renderQuestion() {
      const picked = window.BRAINBOX_MASTERY.pickNextQuestion(boxTopicIds, topicsById, statsCache, shownIds);
      if (!picked) {
        container.innerHTML = `<div class="sc-panel">Box kosong — tambahkan topik dulu.</div>`;
        return;
      }
      shownIds.add(picked.question.id);
      const { question, topic } = picked;

      container.innerHTML = `
        <div class="bb-practice-header">
          <button class="sc-chip bb-practice-home" id="bb-practice-home" title="Exit to menu">🏠</button>
          <div class="bb-practice-progress sc-field-label">Question ${index + 1} / ${SESSION_LENGTH}</div>
        </div>
        <div class="sc-panel bb-practice-card">
          <div class="sc-field-label">${topic.emoji} ${topic.label}</div>
          <div class="bb-practice-prompt">${question.prompt}</div>
          <div class="bb-practice-options"></div>
          <div class="bb-practice-hint hidden" id="bb-practice-hint"></div>
          <button class="sc-btn hidden" id="bb-practice-next">Next ➡️</button>
        </div>
      `;

      container.querySelector("#bb-practice-home").onclick = () => onExit && onExit();

      const optionsEl = container.querySelector(".bb-practice-options");
      const hintEl = container.querySelector("#bb-practice-hint");
      const nextBtn = container.querySelector("#bb-practice-next");

      question.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "sc-btn sc-btn-secondary";
        btn.textContent = opt;
        btn.onclick = () => handleAnswer(opt, question, topic, optionsEl, hintEl, nextBtn);
        optionsEl.appendChild(btn);
      });
    }

    function handleAnswer(chosen, question, topic, optionsEl, hintEl, nextBtn) {
      const isCorrect = chosen === question.answer;
      optionsEl.querySelectorAll("button").forEach((b) => {
        b.disabled = true;
        if (b.textContent === question.answer) b.classList.add("bb-correct");
        else if (b.textContent === chosen) b.classList.add("bb-wrong");
      });
      if (isCorrect) correctCount++;
      window.BRAINBOX_MASTERY.recordAnswer(db, childId, topic.id, isCorrect, statsCache);
      nextBtn.classList.remove("hidden");
      nextBtn.onclick = () => { index++; index < SESSION_LENGTH ? renderQuestion() : renderSummary(); };

      if (!isCorrect) fetchHint(question, topic, chosen, hintEl);
    }

    async function fetchHint(question, topic, chosen, hintEl) {
      try {
        const res = await fetch("/api/generate-hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: childName,
            gameLabel: "Brain Box",
            question: question.prompt,
            correctAnswer: question.answer,
            kidAnswer: chosen,
            topic: topic.label
          })
        });
        if (!res.ok) return; // fail silently — hint card just doesn't show
        const data = await res.json();
        if (!data.hint) return;
        hintEl.innerHTML = "";
        const label = document.createElement("div");
        label.className = "bb-practice-hint-label";
        label.textContent = "🤖 AI Tutor";
        const body = document.createElement("div");
        body.textContent = data.hint;
        hintEl.appendChild(label);
        hintEl.appendChild(body);
        hintEl.classList.remove("hidden");
      } catch (e) {
        // network error — no hint, game still moves on
      }
    }

    function renderSummary() {
      container.innerHTML = `
        <div class="sc-panel bb-practice-summary">
          <div class="bb-drive-end-emoji">🎉</div>
          <div class="sc-screen-title">${correctCount} / ${SESSION_LENGTH} correct!</div>
          <button class="sc-btn" id="bb-practice-again">Play Again</button>
          <button class="sc-btn sc-btn-secondary" id="bb-practice-exit">Exit</button>
        </div>
      `;
      container.querySelector("#bb-practice-again").onclick = () => { index = 0; correctCount = 0; shownIds = new Set(); renderQuestion(); };
      container.querySelector("#bb-practice-exit").onclick = () => onExit && onExit();
    }

    renderQuestion();
  }

  window.BRAINBOX_PRACTICE = { mount, SESSION_LENGTH };
})();
