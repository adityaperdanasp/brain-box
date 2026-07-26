/* =================================================================
   Brain Box — weak-topic weighting & mastery engine.

   Ported faithfully from multipleazka's weightedRand() + streak logic
   (~/Documents/al-idrisi-games/multipleazka/script.js:1420-1453 and
   leaderboard.js:105-117), generalized from "per-value within one
   subject" (e.g. times-7) to "per-topic across mixed subjects" so one
   Box can mix a math chapter, a language chapter, and a science level
   in the same weighted pool.

   Same core rule, unchanged:
     weight   = mastered ? 1 : 1 + wrong * 2
     mastered = streak >= MASTERY_STREAK (5 correct in a row on that topic)
   A wrong answer always resets streak to 0. Historical `wrong` count is
   never decayed — only the streak gates whether it's currently applied.
   ================================================================= */
(function () {
  const MASTERY_STREAK = 5;

  function statsFor(cache, topicId) {
    return cache[topicId] || { correct: 0, wrong: 0, streak: 0 };
  }

  function weightFor(stats) {
    const mastered = (stats.streak || 0) >= MASTERY_STREAK;
    return mastered ? 1 : 1 + (stats.wrong || 0) * 2;
  }

  function weightedPickTopicId(topicIds, statsCache) {
    const weights = topicIds.map((id) => ({ id, weight: weightFor(statsFor(statsCache, id)) }));
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    let r = Math.random() * total;
    for (const w of weights) {
      r -= w.weight;
      if (r <= 0) return w.id;
    }
    return weights[weights.length - 1].id;
  }

  function pickQuestionFromTopic(topic) {
    if (topic.source === "generator") return topic.next();
    const bank = topic.bank;
    return bank[Math.floor(Math.random() * bank.length)];
  }

  function pickNextQuestion(boxTopicIds, topicsById, statsCache) {
    const available = boxTopicIds.filter((id) => topicsById.has(id));
    if (!available.length) return null;
    const topicId = weightedPickTopicId(available, statsCache);
    const topic = topicsById.get(topicId);
    const question = pickQuestionFromTopic(topic);
    return { question, topic };
  }

  /* ---- Firebase-backed stats (Brain Box's own project, own schema) ----
     children/{childId}/topicStats/{topicId}/{correct, wrong, streak, lastWrongAt}
     topicId is already "gameId:chapterId" (e.g. "mathville:place-value"),
     which is Firebase-key-safe (no . # $ / [ ]) since it only uses a colon. */
  async function loadStats(db, childId) {
    const snap = await db.ref(`children/${childId}/topicStats`).get();
    return snap.exists() ? snap.val() : {};
  }

  function recordAnswer(db, childId, topicId, isCorrect, localCache) {
    const ref = db.ref(`children/${childId}/topicStats/${topicId}`);
    ref.child(isCorrect ? "correct" : "wrong").transaction((cur) => (cur || 0) + 1);
    if (!isCorrect) ref.update({ lastWrongAt: firebase.database.ServerValue.TIMESTAMP });
    ref.child("streak").transaction((cur) => (isCorrect ? (cur || 0) + 1 : 0));

    // Mirror locally so the SAME session reflects the new streak/weight
    // immediately — the Firebase read only happens once, at session start.
    const cur = statsFor(localCache, topicId);
    localCache[topicId] = isCorrect
      ? { ...cur, correct: (cur.correct || 0) + 1, streak: (cur.streak || 0) + 1 }
      : { ...cur, wrong: (cur.wrong || 0) + 1, streak: 0 };
  }

  window.BRAINBOX_MASTERY = {
    MASTERY_STREAK,
    weightedPickTopicId,
    pickNextQuestion,
    loadStats,
    recordAnswer
  };
})();
