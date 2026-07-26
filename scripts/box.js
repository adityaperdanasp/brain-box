/* =================================================================
   Brain Box — Topic Box builder (drag topics from any subject into
   one box, capped at MAX_BOX_TOPICS).

   Uses the Pointer Events API (not the HTML5 drag-and-drop spec) on
   purpose — HTML5 DnD is mouse-only in practice and doesn't work on
   iOS Safari touch, and real-device testing on iPhone/Safari is what
   catches the bugs desktop misses. Pointer Events give one code path
   for mouse + touch + pen.

   Interaction: a short pointerdown+pointerup (under DRAG_THRESHOLD px
   of movement) is treated as a tap — toggles the topic in/out of the
   box. A longer movement becomes a real drag with a floating clone
   that snaps into the box (or back to the pool) on release.
   ================================================================= */
(function () {
  const MAX_BOX_TOPICS = 8;
  const DRAG_THRESHOLD = 6;

  const SUBJECT_LABEL = { math: "Math", language: "Language", science: "Science" };

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function mount(container, opts) {
    const { topics, initialBoxTopicIds = [], onChange } = opts;
    let boxIds = initialBoxTopicIds.slice(0, MAX_BOX_TOPICS);
    const topicsById = new Map(topics.map((t) => [t.id, t]));

    container.innerHTML = "";
    const poolEl = el("div", "bb-box-pool");
    const dropEl = el("div", "bb-box-dropzone");
    const countEl = el("div", "bb-box-count");
    const fullMsgEl = el("div", "bb-box-fullmsg", "Box is full (max 8) — remove one first");
    fullMsgEl.style.display = "none";

    dropEl.appendChild(countEl);
    dropEl.appendChild(fullMsgEl);
    container.appendChild(dropEl);
    container.appendChild(poolEl);

    function tileFor(topic, inBox) {
      const tile = el(
        "div",
        `sc-chip sc-topic-tile subject-${topic.subject}`,
        `<span class="sc-topic-icon">${topic.emoji || "⭐"}</span>
         <span>${topic.label}</span>`
      );
      tile.dataset.topicId = topic.id;
      tile.title = inBox ? "Tap or drag out to remove" : "Tap or drag in to add";
      return tile;
    }

    function render() {
      poolEl.innerHTML = "";
      dropEl.querySelectorAll(".sc-topic-tile").forEach((n) => n.remove());
      countEl.textContent = `${boxIds.length} / ${MAX_BOX_TOPICS} topics in the Box`;

      const bySubject = { math: [], language: [], science: [] };
      for (const topic of topics) bySubject[topic.subject].push(topic);

      for (const subject of Object.keys(bySubject)) {
        if (!bySubject[subject].length) continue;
        const group = el("div", "bb-box-group");
        group.appendChild(el("div", "sc-field-label", SUBJECT_LABEL[subject]));
        const row = el("div", "bb-box-row");
        for (const topic of bySubject[subject]) {
          if (boxIds.includes(topic.id)) continue; // shown in the box, not the pool
          const tile = tileFor(topic, false);
          wireInteraction(tile, topic, false);
          row.appendChild(tile);
        }
        group.appendChild(row);
        poolEl.appendChild(group);
      }

      for (const id of boxIds) {
        const topic = topicsById.get(id);
        if (!topic) continue;
        const tile = tileFor(topic, true);
        wireInteraction(tile, topic, true);
        dropEl.appendChild(tile);
      }

      if (typeof onChange === "function") onChange(boxIds.slice());
    }

    function addToBox(topicId) {
      if (boxIds.includes(topicId)) return;
      if (boxIds.length >= MAX_BOX_TOPICS) {
        fullMsgEl.style.display = "block";
        setTimeout(() => (fullMsgEl.style.display = "none"), 1600);
        return;
      }
      boxIds.push(topicId);
      render();
    }

    function removeFromBox(topicId) {
      boxIds = boxIds.filter((id) => id !== topicId);
      render();
    }

    function wireInteraction(tile, topic, inBox) {
      let startX, startY, dragging, clone, moved;

      tile.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        startY = e.clientY;
        dragging = true;
        moved = false;
        tile.setPointerCapture(e.pointerId);
      });

      tile.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          moved = true;
          clone = tile.cloneNode(true);
          clone.style.position = "fixed";
          clone.style.zIndex = 999;
          clone.style.opacity = "0.9";
          clone.style.pointerEvents = "none";
          clone.style.width = tile.offsetWidth + "px";
          document.body.appendChild(clone);
        }
        if (moved && clone) {
          clone.style.left = e.clientX - tile.offsetWidth / 2 + "px";
          clone.style.top = e.clientY - tile.offsetHeight / 2 + "px";
        }
      });

      tile.addEventListener("pointerup", (e) => {
        dragging = false;
        if (clone) {
          const overDrop = isOverElement(e.clientX, e.clientY, dropEl);
          clone.remove();
          clone = null;
          if (inBox && !overDrop) removeFromBox(topic.id);
          else if (!inBox && overDrop) addToBox(topic.id);
          return;
        }
        // plain tap — toggle
        if (inBox) removeFromBox(topic.id);
        else addToBox(topic.id);
      });
    }

    function isOverElement(x, y, target) {
      const rect = target.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    render();

    return {
      getBoxIds: () => boxIds.slice(),
      setBoxIds: (ids) => {
        boxIds = ids.slice(0, MAX_BOX_TOPICS);
        render();
      }
    };
  }

  window.BRAINBOX_BOX = { mount, MAX_BOX_TOPICS };
})();
