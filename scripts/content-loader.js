/* =================================================================
   Brain Box — content loader & adapter.

   Pulls the live question banks from playalidrisi.fun (mathville,
   azkacraft, azkauniverse — all public, CORS-open static files on
   Adit's other project) and normalizes their 5 different schemas
   into ONE canonical, always-multiple-choice question shape so the
   rest of Brain Box (mastery engine, practice screen, Drive Mode)
   only ever has to deal with one format.

   This is a runtime dependency on playalidrisi.fun staying up — if a
   fetch fails, we fall back to the last successful copy cached in
   localStorage. "Generator" chapters (mathville's procedural math,
   e.g. place-value/addition/division) can't be reconstructed from a
   JSON cache since they're plain functions, not data — if the live
   script fails to load AND there's no warm generator already in this
   session, those topics are simply left out of the topic list until
   playalidrisi.fun is reachable again. Static/bank topics from all
   three games degrade gracefully to the cached copy instead.
   ================================================================= */
(function () {
  const SOURCES = {
    mathvilleGenerators: "https://playalidrisi.fun/mathville/generators.js",
    mathvilleQuestions: "https://playalidrisi.fun/mathville/questions.js",
    azkacraft: "https://playalidrisi.fun/azkacraft/questions.json",
    azkauniverse: "https://playalidrisi.fun/azkauniverse/questions.json"
  };

  const CACHE_PREFIX = "bb_content_cache_";

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* storage full/unavailable — non-fatal, just skip caching */
    }
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = url;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("script load failed: " + url));
      document.head.appendChild(el);
    });
  }

  function loadJSON(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error("fetch failed (" + r.status + "): " + url);
      return r.json();
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseNumeric(str) {
    if (typeof str !== "string") return null;
    const cleaned = str.replace(/,/g, "").trim();
    const match = cleaned.match(/^-?\d+(\.\d+)?/);
    if (!match) return null;
    const num = parseFloat(match[0]);
    if (Number.isNaN(num)) return null;
    return { num, prefix: "", suffix: cleaned.slice(match[0].length) };
  }

  /* Numeric distractors: same magnitude, same trailing unit (" cm", " g", etc). */
  function numericDistractors(answer, count) {
    const parsed = parseNumeric(answer);
    if (!parsed) return null;
    const { num, suffix } = parsed;
    const magnitude = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.abs(num) || 1)) - 1));
    const seen = new Set([String(num)]);
    const out = [];
    let guardIterations = 0;
    while (out.length < count && guardIterations < 40) {
      guardIterations++;
      const delta = (Math.floor(Math.random() * 9) + 1) * magnitude * (Math.random() < 0.5 ? -1 : 1);
      const candidate = num + delta;
      if (candidate < 0 && num >= 0) continue;
      const key = String(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate.toLocaleString("en-US") + suffix);
    }
    return out.length ? out : null;
  }

  /* Place-value distractors: the generic "answer ± a nearby number" scheme
     from numericDistractors falls apart here, because a place-value
     answer can be anywhere from "8" to "8,000,000" depending purely on
     which digit position got picked — nearby integers (e.g. 4, 5, 17 for
     an answer of "8") aren't even the right SHAPE of wrong answer. The
     pedagogically real mistake for this topic is confusing which power
     of ten a digit sits in, so distractors are the same digit at other
     plausible positions instead (8 → 80, 800, 8,000, ...). */
  function placeValueDistractors(answer, count) {
    const num = parseInt(String(answer).replace(/,/g, ""), 10);
    if (!num || num < 1) return null;
    let power = 0, digit = num;
    while (digit % 10 === 0) { digit /= 10; power++; }
    if (digit < 1 || digit > 9) return null; // not a clean single-digit place value — bail to generic distractors
    const otherPowers = shuffle([0, 1, 2, 3, 4, 5, 6].filter((p) => p !== power)).slice(0, count);
    return otherPowers.map((p) => (digit * Math.pow(10, p)).toLocaleString("en-US"));
  }

  /* Text distractors: pull other answers from the same topic's pool. */
  function textDistractors(answer, siblingAnswers, count) {
    const normalizedAnswer = String(answer).trim().toLowerCase();
    const pool = shuffle(
      siblingAnswers.filter((a) => String(a).trim().toLowerCase() !== normalizedAnswer)
    );
    const out = [];
    const seen = new Set([normalizedAnswer]);
    for (const candidate of pool) {
      const key = String(candidate).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
      if (out.length >= count) break;
    }
    return out;
  }

  function buildOptions(answer, siblingAnswers) {
    const wanted = 3;
    let distractors = numericDistractors(answer, wanted);
    if (!distractors || distractors.length < 2) {
      const textOnes = textDistractors(answer, siblingAnswers, wanted);
      distractors = distractors ? distractors.concat(textOnes) : textOnes;
    }
    distractors = distractors.slice(0, wanted);
    return shuffle([answer].concat(distractors));
  }

  let idCounter = 0;
  function nextId(prefix) {
    idCounter++;
    return prefix + "-" + idCounter;
  }

  function normalizeMc(raw, topicId, siblingAnswers) {
    // azkauniverse: raw.answer is an index into raw.options.
    // azkacraft: raw.answer is already the option string.
    const answer =
      typeof raw.answer === "number" ? raw.options[raw.answer] : raw.answer;
    return {
      id: nextId(topicId),
      topicId,
      originalType: "mc",
      prompt: raw.prompt || raw.question,
      // azkauniverse's diagram questions (star-lifecycle/atom-structure/
      // earth-rotation/globes-maps) carry an inline-SVG q.image the
      // question is unanswerable without ("what does part ② point to?")
      // — trusted content from playalidrisi.fun, same as prompt/options,
      // so it's fine to render directly.
      image: raw.image || null,
      options: shuffle(raw.options),
      answer
    };
  }

  function normalizeFill(raw, topicId, siblingAnswers) {
    const prompt = raw.prompt || raw.question;
    const answer = raw.answer;
    return {
      id: nextId(topicId),
      topicId,
      originalType: "fill",
      prompt,
      // mathville's newer static questions (factor trees, associative
      // property, divisibility tables) carry the same optional q.image
      // SVG that azkauniverse's mc questions do — see normalizeMc.
      image: raw.image || null,
      options: buildOptions(answer, siblingAnswers),
      answer
    };
  }

  function normalizeGenerated(raw, topicId) {
    // Generator output has no sibling pool (infinite, on-demand) — numeric only.
    // place-value needs its own distractor shape (see placeValueDistractors);
    // everything else (addition, multiplication, rounding, measurement, ...)
    // uses the generic "nearby number" scheme.
    const distractors = topicId === "mathville:place-value"
      ? placeValueDistractors(raw.answer, 3) || numericDistractors(raw.answer, 3) || []
      : numericDistractors(raw.answer, 3) || [];
    return {
      id: nextId(topicId),
      topicId,
      originalType: "generator",
      prompt: raw.prompt,
      image: raw.image || null,
      options: shuffle([raw.answer].concat(distractors.slice(0, 3))),
      answer: raw.answer
    };
  }

  /* match -> one mini mc question per pair, using the OTHER pairs' right-hand
     values in the same set as distractors (guaranteed plausible-but-wrong). */
  function normalizeMatch(raw, topicId) {
    const pairs = raw.pairs.map((p) => ({
      left: p.left || p.term,
      right: p.right || p.match
    }));
    return pairs.map((pair) => {
      const rights = pairs.map((p) => p.right);
      return {
        id: nextId(topicId),
        topicId,
        originalType: "match",
        prompt: (raw.prompt ? raw.prompt + " — " : "") + `What matches "${pair.left}"?`,
        image: raw.image || null,
        options: buildOptions(pair.right, rights),
        answer: pair.right
      };
    });
  }

  /* flashcard -> "what does X mean?" style mc, distractors from sibling
     flashcards' back/definition text in the same topic. */
  function normalizeFlashcards(rawList, topicId) {
    const backs = rawList.map((f) => f.back || f.definition);
    return rawList.map((f) => {
      const front = f.front || f.word;
      const back = f.back || f.definition;
      return {
        id: nextId(topicId),
        topicId,
        originalType: "flashcard",
        prompt: f.front ? front : `What does "${front}" mean?`,
        image: f.image || null,
        options: buildOptions(back, backs),
        answer: back
      };
    });
  }

  /* sentence-builder -> correct order vs. 2-3 shuffled (wrong) orders of the
     same words, so distractors are guaranteed plausible and self-contained. */
  function normalizeSentenceBuilder(raw, topicId) {
    const correct = raw.answer;
    const seen = new Set([correct]);
    const wrongOrders = [];
    let guard = 0;
    while (wrongOrders.length < 3 && guard < 20) {
      guard++;
      const candidate = shuffle(raw.words).join(" ");
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      wrongOrders.push(candidate);
    }
    return {
      id: nextId(topicId),
      topicId,
      originalType: "sentence-builder",
      prompt: "Put the words in order: " + shuffle(raw.words).join(" / "),
      image: raw.image || null,
      options: shuffle([correct].concat(wrongOrders)),
      answer: correct
    };
  }

  function normalizeBankQuestions(rawQuestions, topicId) {
    const byType = { fill: [], mc: [], match: [], flashcard: [], "sentence-builder": [] };
    for (const q of rawQuestions) (byType[q.type] || byType.fill).push(q);

    const fillAnswers = byType.fill.map((q) => q.answer);
    const out = [];
    for (const q of byType.mc) out.push(normalizeMc(q, topicId));
    for (const q of byType.fill) out.push(normalizeFill(q, topicId, fillAnswers));
    for (const q of byType.match) out.push(...normalizeMatch(q, topicId));
    if (byType.flashcard.length) out.push(...normalizeFlashcards(byType.flashcard, topicId));
    for (const q of byType["sentence-builder"]) out.push(normalizeSentenceBuilder(q, topicId));
    return out;
  }

  // mathville's genPlaceValue() picks a random digit-position out of
  // whatever's actually in the generated number, with no guard against
  // that digit appearing more than once (e.g. "the value of the digit 8
  // in 785,628" — there are two 8s, so the question itself doesn't say
  // which one). Free-text input hid this in the original game; as
  // multiple-choice it reads as broken. Retry a few times for a number
  // where the target digit is unambiguous — same shape as mathville's
  // own Drive Mode retry loop for "clean" quick-answers.
  function isAmbiguousPlaceValueQuestion(raw) {
    const match = raw.prompt.match(/digit (\d) in ([\d,]+)/);
    if (!match) return false;
    const digit = match[1];
    const numStr = match[2].replace(/,/g, "");
    return numStr.split("").filter((c) => c === digit).length > 1;
  }

  function buildMathvilleTopics(bank, generators) {
    return (bank.chapters || []).map((chapter) => {
      const topicId = "mathville:" + chapter.id;
      if (chapter.mode === "generator" && generators) {
        const fns = chapter.generatorKeys.map((k) => generators[k]).filter(Boolean);
        if (!fns.length) return null;
        return {
          id: topicId,
          subject: "math",
          gameId: "mathville",
          label: chapter.title,
          emoji: chapter.emoji,
          source: "generator",
          next: () => {
            if (topicId !== "mathville:place-value") {
              return normalizeGenerated(fns[Math.floor(Math.random() * fns.length)](), topicId);
            }
            let raw, guard = 0;
            do {
              raw = fns[0]();
              guard++;
            } while (isAmbiguousPlaceValueQuestion(raw) && guard < 8);
            return normalizeGenerated(raw, topicId);
          }
        };
      }
      const staticQs = (chapter.questions || [])
        .concat(chapter.staticQuestions || [])
        .filter((q) => !q.skipInRound);
      const answers = staticQs.map((q) => q.answer);
      return {
        id: topicId,
        subject: "math",
        gameId: "mathville",
        label: chapter.title,
        emoji: chapter.emoji,
        source: "bank",
        bank: staticQs.map((q) => normalizeFill(q, topicId, answers))
      };
    }).filter(Boolean);
  }

  function buildAzkacraftTopics(data) {
    return (data.chapters || []).map((chapter) => {
      const topicId = "azkacraft:" + chapter.id;
      return {
        id: topicId,
        subject: "language",
        gameId: "azkacraft",
        label: chapter.title,
        emoji: "📖",
        source: "bank",
        bank: normalizeBankQuestions(chapter.questions, topicId)
      };
    });
  }

  function buildAzkauniverseTopics(data) {
    return (data.levels || []).map((level) => {
      const topicId = "azkauniverse:" + level.id;
      return {
        id: topicId,
        subject: "science",
        gameId: "azkauniverse",
        label: level.name,
        emoji: level.emoji || "🔭",
        source: "bank",
        bank: normalizeBankQuestions(level.questions, topicId)
      };
    });
  }

  async function loadMathville() {
    try {
      await Promise.all([loadScript(SOURCES.mathvilleQuestions), loadScript(SOURCES.mathvilleGenerators)]);
      cacheSet("mathvilleBank", window.MATHVILLE_BANK);
      return buildMathvilleTopics(window.MATHVILLE_BANK, window.MATHVILLE_GENERATORS);
    } catch (e) {
      console.warn("[Brain Box] mathville live load failed, using cache", e);
      const cached = cacheGet("mathvilleBank");
      // No cached generators possible (functions aren't JSON) — generator
      // chapters are simply unavailable this session, bank chapters survive.
      return cached ? buildMathvilleTopics(cached, null) : [];
    }
  }

  async function loadAzkacraft() {
    try {
      const data = await loadJSON(SOURCES.azkacraft);
      cacheSet("azkacraft", data);
      return buildAzkacraftTopics(data);
    } catch (e) {
      console.warn("[Brain Box] azkacraft live load failed, using cache", e);
      const cached = cacheGet("azkacraft");
      return cached ? buildAzkacraftTopics(cached) : [];
    }
  }

  async function loadAzkauniverse() {
    try {
      const data = await loadJSON(SOURCES.azkauniverse);
      cacheSet("azkauniverse", data);
      return buildAzkauniverseTopics(data);
    } catch (e) {
      console.warn("[Brain Box] azkauniverse live load failed, using cache", e);
      const cached = cacheGet("azkauniverse");
      return cached ? buildAzkauniverseTopics(cached) : [];
    }
  }

  async function loadAllTopics() {
    const [math, language, science] = await Promise.all([
      loadMathville(),
      loadAzkacraft(),
      loadAzkauniverse()
    ]);
    const topics = [...math, ...language, ...science];
    const byId = new Map(topics.map((t) => [t.id, t]));
    return { topics, byId };
  }

  window.BRAINBOX_CONTENT = { loadAllTopics };
})();
