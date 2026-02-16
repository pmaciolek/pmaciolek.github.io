(() => {
  const root = document.getElementById("slides-root");
  if (!root) return;

  const slides = Array.from(document.querySelectorAll(".slide"));
  const progressFill = document.getElementById("progress-fill");
  const notesDelayMs = Number(root.dataset.notesDelayMs || 320);
  const transitionMs = Number(root.dataset.transitionMs || 700);
  const total = slides.length;

  let activeIndex = 0;
  let wheelLocked = false;
  let pendingIndex = null;
  let touchStartY = 0;
  const noteTimers = new Map();
  const NOTE_WORD_DELAY_MS = 18;
  const NOTE_REVEAL_PRIME_MS = 180;
  const OBSERVER_SETTLE_MS = 120;
  let observerSettleTimer = null;
  let observerCandidateIndex = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const hashToIndex = (hashValue) => {
    const raw = (hashValue || "").trim();
    if (!raw || raw === "#") return null;
    const cleaned = raw.startsWith("#") ? raw.slice(1) : raw;

    const byId = document.getElementById(cleaned);
    if (byId && byId.dataset.slideIndex != null) {
      const idx = Number(byId.dataset.slideIndex);
      return Number.isFinite(idx) ? clamp(idx, 0, total - 1) : null;
    }

    const match = /^slide-(\d+)$/i.exec(cleaned);
    if (!match) return null;
    const idx = Number(match[1]) - 1;
    return Number.isFinite(idx) ? clamp(idx, 0, total - 1) : null;
  };

  const syncHashToActiveSlide = () => {
    const activeSlide = slides[activeIndex];
    if (!activeSlide || !activeSlide.id) return;
    const targetHash = `#${activeSlide.id}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, "", targetHash);
    }
  };

  const clearNoteTimers = () => {
    noteTimers.forEach((timerId) => window.clearTimeout(timerId));
    noteTimers.clear();
  };

  const updateProgress = () => {
    if (!progressFill) return;
    if (total <= 1) {
      progressFill.style.height = "100%";
      return;
    }
    const ratio = (activeIndex / (total - 1)) * 100;
    progressFill.style.height = `${ratio}%`;
  };

  const prepareWordsForReveal = (notesEl) => {
    if (!notesEl || notesEl.dataset.wordsPrepared === "true") return;

    const wrapTextNode = (textNode, outWords) => {
      const text = textNode.textContent || "";
      const parts = text.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (!part) continue;
        if (part.trim().length === 0) {
          fragment.appendChild(document.createTextNode(part));
          continue;
        }
        const span = document.createElement("span");
        span.className = "note-word";
        span.textContent = part;
        outWords.push(span);
        fragment.appendChild(span);
      }
      textNode.replaceWith(fragment);
    };

    const walk = (node, outWords) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE) {
          wrapTextNode(child, outWords);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child, outWords);
        }
      }
    };

    const words = [];
    walk(notesEl, words);
    notesEl.dataset.wordsPrepared = "true";
  };

  const runWordReveal = (slideEl) => {
    const notesEl = slideEl.querySelector(".slide-notes");
    if (!notesEl) return;

    prepareWordsForReveal(notesEl);
    const words = Array.from(notesEl.querySelectorAll(".note-word"));
    if (!words.length) return;

    let delay = 0;
    for (const word of words) {
      word.style.transitionDelay = `${delay}ms`;
      word.classList.add("word-visible");
      delay += NOTE_WORD_DELAY_MS;
    }
  };

  const activateSlide = (index) => {
    const nextIndex = clamp(index, 0, total - 1);
    if (nextIndex === activeIndex && slides[activeIndex]?.classList.contains("is-active")) {
      return;
    }
    activeIndex = nextIndex;
    clearNoteTimers();

    slides.forEach((slide, idx) => {
      slide.classList.toggle("is-active", idx === activeIndex);
      slide.classList.remove("is-notes-visible");
    });

    const activeSlide = slides[activeIndex];
    if (activeSlide) {
      const notesEl = activeSlide.querySelector(".slide-notes");
      if (notesEl) {
        prepareWordsForReveal(notesEl);
        const words = Array.from(notesEl.querySelectorAll(".note-word"));
        for (const word of words) {
          word.classList.remove("word-visible");
          word.style.transitionDelay = "0ms";
        }
      }
      const timerId = window.setTimeout(() => {
        if (!activeSlide.classList.contains("is-active")) return;
        activeSlide.classList.add("is-notes-visible");
        window.setTimeout(() => {
          if (!activeSlide.classList.contains("is-active")) return;
          runWordReveal(activeSlide);
        }, NOTE_REVEAL_PRIME_MS);
      }, notesDelayMs);
      noteTimers.set(activeSlide, timerId);
    }
    updateProgress();
    syncHashToActiveSlide();
  };

  const scheduleObserverActivation = (index) => {
    if (index === activeIndex) return;
    observerCandidateIndex = index;
    if (observerSettleTimer) window.clearTimeout(observerSettleTimer);
    observerSettleTimer = window.setTimeout(() => {
      if (wheelLocked || pendingIndex !== null) return;
      if (observerCandidateIndex === null || observerCandidateIndex === activeIndex) return;
      activateSlide(observerCandidateIndex);
    }, OBSERVER_SETTLE_MS);
  };

  const goToSlide = (nextIndex) => {
    const target = clamp(nextIndex, 0, total - 1);
    if (target === activeIndex) return;
    wheelLocked = true;
    pendingIndex = target;
    slides[target].scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      if (activeIndex !== target) {
        activateSlide(target);
      }
      wheelLocked = false;
      pendingIndex = null;
    }, transitionMs);
  };

  root.addEventListener("touchstart", (event) => {
    touchStartY = event.touches[0]?.clientY || 0;
  });

  root.addEventListener("touchend", (event) => {
    const endY = event.changedTouches[0]?.clientY || 0;
    const delta = touchStartY - endY;
    if (Math.abs(delta) < 24 || wheelLocked) return;
    goToSlide(delta > 0 ? activeIndex + 1 : activeIndex - 1);
  });

  document.addEventListener("keydown", (event) => {
    if (wheelLocked) return;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      goToSlide(activeIndex + 1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      goToSlide(activeIndex - 1);
    }
  });

  window.addEventListener("hashchange", () => {
    const target = hashToIndex(window.location.hash);
    if (target == null || target === activeIndex) return;
    goToSlide(target);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      if (wheelLocked || pendingIndex !== null) return;
      let bestEntry = null;
      for (const entry of entries) {
        if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
          bestEntry = entry;
        }
      }
      if (!bestEntry || !bestEntry.isIntersecting) return;
      const idx = Number(bestEntry.target.dataset.slideIndex || 0);
      scheduleObserverActivation(idx);
    },
    { root, threshold: [0.4, 0.6, 0.8] }
  );

  slides.forEach((slide) => observer.observe(slide));
  const initialHashIndex = hashToIndex(window.location.hash);
  if (initialHashIndex != null) {
    const initialSlide = slides[initialHashIndex];
    if (initialSlide) {
      initialSlide.scrollIntoView({ behavior: "auto", block: "start" });
      activateSlide(initialHashIndex);
    } else {
      activateSlide(0);
    }
  } else {
    activateSlide(0);
  }
})();
