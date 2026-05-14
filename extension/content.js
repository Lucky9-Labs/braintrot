const DEFAULTS = {
  phrases: [],
  whitelist: [],
  moteEnabled: false,
};

const FALLBACK_BANK = [
  { word: "bailiwick", definition: "One's area of expertise or authority", wrong: ["A type of medieval weapon", "A small coastal inlet"] },
  { word: "petrichor", definition: "The pleasant smell of earth after rain", wrong: ["A type of fossilized amber", "A shade of dark green"] },
  { word: "defenestration", definition: "The act of throwing someone out of a window", wrong: ["Removing a fence or barrier", "A formal process of excommunication"] },
  { word: "saudade", definition: "A deep emotional longing for something absent", wrong: ["A traditional Portuguese dance", "A type of dry red wine"] },
  { word: "tsundoku", definition: "Acquiring books and letting them pile up unread", wrong: ["The art of Japanese gift wrapping", "A form of silent meditation"] },
  { word: "apricity", definition: "The warmth of the sun in winter", wrong: ["The ability to learn quickly", "A formal apology or retraction"] },
  { word: "phosphene", definition: "The light you see when you rub your closed eyes", wrong: ["A chemical used in photography", "A type of deep-sea fish"] },
  { word: "clinomania", definition: "An excessive desire to stay in bed", wrong: ["A fear of steep hills", "An obsession with collecting clocks"] },
];

let blockPhrases = [];
let whitelistHandles = [];
let fallbackIdx = 0;

// ── Site adapters ──
// Each adapter knows how to find content items and extract text for matching.

const SITE_ADAPTERS = {
  instagram: {
    // Explore grid: <a href="/p/..."> tiles with <img alt="caption">
    // Main feed / reels: <article> elements with caption text and images
    findItems() {
      const results = [];
      // Feed articles
      document.querySelectorAll('article:not([data-braintrot-scanned])').forEach((el) => {
        results.push(el);
      });
      // Explore grid tiles — skip links inside articles (already covered)
      document.querySelectorAll('a[href*="/p/"]:not([data-braintrot-scanned])').forEach((el) => {
        if (!el.closest("article")) results.push(el);
      });
      return results;
    },
    getText(el) {
      if (el.tagName === "ARTICLE") {
        // Feed post: gather all text — caption, alt text on images, username
        const parts = [];
        // Image alt texts contain the caption
        el.querySelectorAll("img[alt]").forEach((img) => {
          if (img.alt && img.alt.length > 5) parts.push(img.alt);
        });
        // Also check visible caption/comment text
        el.querySelectorAll("span").forEach((span) => {
          const t = span.textContent?.trim();
          if (t && t.length > 10 && t.length < 500) parts.push(t);
        });
        return parts.join(" ");
      }
      // Explore grid tile
      const img = el.querySelector("img");
      return img?.alt || "";
    },
    getContainer(el) {
      return el;
    },
  },

  youtube: {
    // YouTube: video renderers with title text
    // Home feed uses ytd-rich-item-renderer, search/sidebar uses ytd-video-renderer
    // Shorts use ytd-reel-item-renderer
    findItems() {
      return document.querySelectorAll(`
        ytd-rich-item-renderer:not([data-braintrot-scanned]),
        ytd-video-renderer:not([data-braintrot-scanned]),
        ytd-compact-video-renderer:not([data-braintrot-scanned]),
        ytd-reel-item-renderer:not([data-braintrot-scanned]),
        ytd-watch-metadata:not([data-braintrot-scanned])
      `);
    },
    getText(el) {
      // Title is in #video-title or a[id="video-title"]
      const titleEl =
        el.querySelector("#video-title") ||
        el.querySelector("h3 a") ||
        el.querySelector("[id='video-title-link']");
      const title = titleEl?.textContent?.trim() || "";
      // Description snippet (search results) or watch page description
      const descEl = el.querySelector("#description-text, .metadata-snippet-text, #description-inner, ytd-text-inline-expander");
      const desc = descEl?.textContent?.trim() || "";
      return title + " " + desc;
    },
    getContainer(el) {
      // On watch pages, cover the video player instead of the metadata
      if (el.tagName?.toLowerCase() === "ytd-watch-metadata") {
        const player = document.querySelector("#movie_player, #player-container-outer");
        if (player) return player;
      }
      return el;
    },
  },

  twitter: {
    // X/Twitter: tweets are <article> elements with tweet text inside
    findItems() {
      return document.querySelectorAll('article[data-testid="tweet"]:not([data-braintrot-scanned])');
    },
    getText(el) {
      // Tweet text is in [data-testid="tweetText"]
      const textEl = el.querySelector('[data-testid="tweetText"]');
      return textEl?.textContent?.trim() || "";
    },
    getContainer(el) {
      return el; // overlay the entire tweet
    },
  },
};

function detectSite() {
  const host = location.hostname;
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("youtube.com")) return "youtube";
  if (host.includes("x.com") || host.includes("twitter.com")) return "twitter";
  return null;
}

const currentSite = detectSite();
const adapter = currentSite ? SITE_ADAPTERS[currentSite] : null;

// ── Core logic (site-agnostic) ──

function buildRegex(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function isSpoiler(text) {
  const lower = text.toLowerCase();
  for (const handle of whitelistHandles) {
    if (lower.includes(`@${handle}`) || lower.includes(handle)) return false;
  }
  for (const re of blockPhrases) {
    if (re.test(text)) return true;
  }
  return false;
}

async function getQuizEntry() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getQuizEntry" }, (response) => {
      if (response?.entry) {
        resolve(response.entry);
      } else {
        const entry = FALLBACK_BANK[fallbackIdx % FALLBACK_BANK.length];
        fallbackIdx++;
        resolve(entry);
      }
    });
  });
}

// ── Confetti ──

function fireConfetti(container) {
  const canvas = document.createElement("canvas");
  canvas.className = "braintrot-confetti";
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const particles = Array.from({ length: 60 }, () => ({
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 10,
    vy: (Math.random() - 0.5) * 10 - 3,
    size: Math.random() * 5 + 2,
    color: ["#00C3F7", "#00b0e0", "#27ae60", "#f39c12", "#e74c3c", "#8e44ad"][
      Math.floor(Math.random() * 6)
    ],
    rotation: Math.random() * 360,
    spin: (Math.random() - 0.5) * 12,
    life: 1,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.rotation += p.spin;
      p.life -= 0.018;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive && frame < 120) {
      frame++;
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(draw);
}

// ── Build quiz card ──

function buildCard(entry) {
  const card = document.createElement("div");
  card.className = "braintrot-card";
  card.dataset.word = entry.word;

  const options = [
    { text: entry.definition, correct: true },
    { text: entry.wrong[0], correct: false },
    { text: entry.wrong[1], correct: false },
  ].sort(() => Math.random() - 0.5);

  card.innerHTML = `
    <div class="braintrot-flipper">
      <div class="braintrot-front">
        <img class="braintrot-label" src="${chrome.runtime.getURL("logo.svg")}" alt="braintrot">
        <div class="braintrot-word-row">
          <div class="braintrot-word">${entry.word}</div>
          ${entry.audioUrl ? `<button class="braintrot-speak" data-audio="${entry.audioUrl}">&#128264;</button>` : ""}
        </div>
        <div class="braintrot-options">
          ${options
            .map(
              (o) =>
                `<button class="braintrot-option" data-correct="${o.correct}">${o.text}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="braintrot-back">
        <div class="braintrot-back-check">&#10003;</div>
        <div class="braintrot-word-row back">
          <div class="braintrot-back-word">${entry.word}</div>
          ${entry.audioUrl ? `<button class="braintrot-speak" data-audio="${entry.audioUrl}">&#128264;</button>` : ""}
        </div>
        <div class="braintrot-back-def">${entry.definition}</div>
      </div>
    </div>
  `;

  const btns = card.querySelectorAll(".braintrot-option");
  btns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.correct === "true") {
        btn.classList.add("correct");
        btns.forEach((b) => {
          b.style.pointerEvents = "none";
          if (b !== btn) b.classList.add("wrong");
        });
        fireConfetti(card);
        setTimeout(() => {
          card.classList.add("flipped");
          setTimeout(() => moteCelebrate(), 500);
        }, 600);
      } else {
        btn.classList.add("wrong");
        btn.style.pointerEvents = "none";
        card.classList.add("braintrot-shake");
        setTimeout(() => card.classList.remove("braintrot-shake"), 400);
        moteHeadshake();
      }
    });
  });

  // Pronunciation audio buttons
  card.querySelectorAll(".braintrot-speak").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      let url = btn.dataset.audio;
      // API sometimes returns protocol-relative or bare URLs
      if (url.startsWith("//")) url = "https:" + url;
      else if (!url.startsWith("http")) url = "https://" + url;
      const audio = new Audio(url);
      audio.play().catch(() => console.warn("[Braintrot] Audio playback failed:", url));
    });
  });

  card.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  return card;
}

// ── Scan and replace ──

let scanning = false;
let rescanQueued = false;

async function scanAll() {
  if (!adapter || scanning) {
    if (scanning) rescanQueued = true;
    return;
  }
  scanning = true;

  try {
    const items = adapter.findItems();

    for (const item of items) {
      item.dataset.braintrotScanned = "true";
      const text = adapter.getText(item);
      if (!isSpoiler(text)) continue;

      const container = adapter.getContainer(item);
      container.dataset.braintrot = "true";

      const entry = await getQuizEntry();
      const card = buildCard(entry);

      observer?.disconnect();
      container.appendChild(card);
      observer?.observe(document.body, { childList: true, subtree: true });

      console.log(`[Braintrot] (${currentSite}) Replaced with quiz: ${entry.word}`);
    }

    // Handle un-blocking: check previously blocked items whose text no longer matches
    const blocked = document.querySelectorAll("[data-braintrot]");
    for (const container of blocked) {
      // Find the original item (the scanned element)
      const item = container.closest("[data-braintrot-scanned]") || container;
      const text = adapter.getText(item);
      if (!isSpoiler(text)) {
        delete container.dataset.braintrot;
        observer?.disconnect();
        const card = container.querySelector(".braintrot-card");
        if (card) card.remove();
        observer?.observe(document.body, { childList: true, subtree: true });
        // Allow re-scanning
        delete item.dataset.braintrotScanned;
        console.log(`[Braintrot] (${currentSite}) Restored post`);
      }
    }
  } finally {
    scanning = false;
  }

  if (rescanQueued) {
    rescanQueued = false;
    scanAll();
  }
}

// ── Debounced scan ──

let scanTimer = null;
function debouncedScan() {
  if (scanTimer) cancelAnimationFrame(scanTimer);
  scanTimer = requestAnimationFrame(() => {
    scanTimer = null;
    scanAll();
  });
}

// ── Load settings and start ──

function loadSettings(callback) {
  chrome.storage.sync.get(DEFAULTS, (data) => {
    blockPhrases = data.phrases.map(buildRegex);
    whitelistHandles = data.whitelist.map((h) => h.toLowerCase());
    console.log(
      `[Braintrot] (${currentSite}) Loaded ${blockPhrases.length} phrase(s), ${whitelistHandles.length} whitelisted`
    );
    if (callback) callback();
  });
}

let observer = null;

loadSettings(() => {
  scanAll();
  observer = new MutationObserver(debouncedScan);
  observer.observe(document.body, { childList: true, subtree: true });
});

// Real-time settings updates from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.phrases || changes.whitelist)) {
    // Reset scanned flags so everything gets re-evaluated
    document.querySelectorAll("[data-braintrot-scanned]").forEach((el) => {
      delete el.dataset.braintrotScanned;
    });
    loadSettings(() => scanAll());
  }
});

// ── Mote: spring-physics companion with expression system ──
//
// Architecture:
//   1. getOrbitTarget() always computes where the mote "should" be (border of active card)
//   2. Expressions are temporary offset perturbations (headshake, bounce) layered on top
//   3. When an expression ends, the offset decays to zero and the spring carries the mote
//      naturally to wherever the orbit target now points (which may be a different card)
//   4. The spring ALWAYS drives movement. Nothing teleports.

let moteEl = null;
let trailCanvas = null;
let trailCtx = null;
let activeCard = null;
let moteAngle = 0;
let trailPoints = [];

// Spring physics
let moteX = 0, moteY = 0;
let moteVX = 0, moteVY = 0;

const SPRING_STIFFNESS = 2.0;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS);
const MAX_SPEED = 12;

// Expression layer: offsets added on top of the orbit target
let exprOffsetX = 0, exprOffsetY = 0;
let expression = null; // null | { type, timer, data }

let lastTime = 0;

function ensureMote() {
  if (!moteEl) {
    moteEl = document.createElement("div");
    moteEl.className = "braintrot-mote";
    moteEl.style.opacity = "0";
    document.body.appendChild(moteEl);
  }
  if (!trailCanvas) {
    trailCanvas = document.createElement("canvas");
    trailCanvas.className = "braintrot-trail";
    const resizeCanvas = () => {
      trailCanvas.width = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      trailCanvas.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    };
    resizeCanvas();
    document.body.appendChild(trailCanvas);
    trailCtx = trailCanvas.getContext("2d");
    window.addEventListener("resize", resizeCanvas);
  }
}

function getNextUnansweredCard() {
  return document.querySelector(".braintrot-card:not(.flipped)") || null;
}

// Rounded rect border path (page-absolute coordinates)
function borderPoint(rect, t) {
  const sx = window.scrollX, sy = window.scrollY;
  const inset = 6, r = 12;
  const l = rect.left + sx + inset, r2 = rect.right + sx - inset;
  const top = rect.top + sy + inset, bot = rect.bottom + sy - inset;
  const w = r2 - l - 2 * r, h = bot - top - 2 * r;
  const ca = Math.PI * r / 2;
  const perim = 2 * (w + h) + 4 * ca;
  let d = (t % 1) * perim;
  if (d < w) return { x: l+r+d, y: top };
  d -= w;
  if (d < ca) { const a = -Math.PI/2+(d/ca)*(Math.PI/2); return { x: r2-r+Math.cos(a)*r, y: top+r+Math.sin(a)*r }; }
  d -= ca;
  if (d < h) return { x: r2, y: top+r+d };
  d -= h;
  if (d < ca) { const a = (d/ca)*(Math.PI/2); return { x: r2-r+Math.cos(a)*r, y: bot-r+Math.sin(a)*r }; }
  d -= ca;
  if (d < w) return { x: r2-r-d, y: bot };
  d -= w;
  if (d < ca) { const a = Math.PI/2+(d/ca)*(Math.PI/2); return { x: l+r+Math.cos(a)*r, y: bot-r+Math.sin(a)*r }; }
  d -= ca;
  if (d < h) return { x: l, y: bot-r-d };
  d -= h;
  if (d < ca) { const a = Math.PI+(d/ca)*(Math.PI/2); return { x: l+r+Math.cos(a)*r, y: top+r+Math.sin(a)*r }; }
  return { x: l+r, y: top };
}

// ── Step 1: Compute orbit target (where the mote wants to be) ──

function getOrbitTarget() {
  // If active card is gone/flipped, move to next
  if (!activeCard || activeCard.classList.contains("flipped")) {
    activeCard = getNextUnansweredCard();
  }
  if (!activeCard) return null;

  const rect = activeCard.getBoundingClientRect();
  moteAngle = (moteAngle + 0.0008) % 1;
  return borderPoint(rect, moteAngle);
}

// ── Step 2: Tick expression (computes exprOffsetX/Y) ──

function tickExpression(dt) {
  if (!expression) {
    // Decay offsets to zero when no expression is active
    exprOffsetX *= 0.92;
    exprOffsetY *= 0.92;
    return;
  }

  expression.timer += dt;

  if (expression.type === "headshake") {
    const totalDuration = 90; // ~1.5s
    if (expression.timer > totalDuration) {
      expression = null;
      return;
    }
    const decay = 1 - expression.timer / totalDuration;
    const freq = expression.timer / 15;
    exprOffsetX = Math.sin(freq * Math.PI * 2) * 20 * decay;
    exprOffsetY = 0;
  }

  if (expression.type === "celebrate") {
    const bounceDuration = 120; // ~2s of bouncing
    if (expression.timer > bounceDuration) {
      expression = null;
      return;
    }
    const decay = 1 - expression.timer / bounceDuration;
    const freq = expression.timer / 20;
    // Bouncing: downward drift + vertical hops that diminish
    const hopHeight = Math.abs(Math.sin(freq * Math.PI)) * 30 * decay;
    exprOffsetX = expression.timer * 0.15; // gentle rightward drift
    exprOffsetY = 30 * (1 - decay) - hopHeight; // settle downward, hop up
  }
}

// ── Step 3: Spring integrator ──

function springStep(targetX, targetY, dt) {
  const fx = SPRING_STIFFNESS * (targetX - moteX) - SPRING_DAMPING * moteVX;
  const fy = SPRING_STIFFNESS * (targetY - moteY) - SPRING_DAMPING * moteVY;
  moteVX += fx * dt;
  moteVY += fy * dt;
  const speed = Math.sqrt(moteVX * moteVX + moteVY * moteVY);
  if (speed > MAX_SPEED) {
    moteVX = (moteVX / speed) * MAX_SPEED;
    moteVY = (moteVY / speed) * MAX_SPEED;
  }
  moteX += moteVX * dt;
  moteY += moteVY * dt;
}

// ── Main loop ──

function moteLoop(timestamp) {
  if (!moteRunning) return;
  ensureMote();

  const dt = lastTime ? Math.min((timestamp - lastTime) / 16.67, 3) : 1;
  lastTime = timestamp;

  // 1. Where should the mote be?
  const orbitPt = getOrbitTarget();

  // 2. What expression offset applies?
  tickExpression(dt);

  // 3. Final target = orbit + expression offset
  if (orbitPt) {
    const targetX = orbitPt.x + exprOffsetX;
    const targetY = orbitPt.y + exprOffsetY;

    // 4. Spring drives us there
    springStep(targetX, targetY, dt);

    moteEl.style.opacity = "1";
    moteEl.style.left = (moteX - 4) + "px";
    moteEl.style.top = (moteY - 4) + "px";
    trailPoints.push({ x: moteX, y: moteY, life: 1 });
  } else {
    moteEl.style.opacity = "0";
  }

  // Draw trail
  if (trailCtx) {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    for (let i = trailPoints.length - 1; i >= 0; i--) {
      const p = trailPoints[i];
      p.life -= 0.012 * dt;
      if (p.life <= 0) { trailPoints.splice(i, 1); continue; }
      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, 3.5 * p.life, 0, Math.PI * 2);
      trailCtx.fillStyle = `rgba(0, 195, 247, ${p.life * 0.3})`;
      trailCtx.fill();
    }
  }

  requestAnimationFrame(moteLoop);
}

// ── Triggers (called from quiz handlers) ──

function moteHeadshake() {
  if (!moteRunning) return;
  expression = { type: "headshake", timer: 0 };
}

function moteCelebrate() {
  if (!moteRunning) return;
  expression = { type: "celebrate", timer: 0 };
}

// Start mote only if enabled
let moteRunning = false;

function startMote() {
  if (moteRunning) return;
  moteRunning = true;
  activeCard = getNextUnansweredCard();
  if (activeCard) {
    const r = activeCard.getBoundingClientRect();
    moteX = r.left + window.scrollX + r.width / 2;
    moteY = r.top + window.scrollY + 6;
  }
  requestAnimationFrame(moteLoop);
}

function stopMote() {
  moteRunning = false;
  if (moteEl) { moteEl.remove(); moteEl = null; }
  if (trailCanvas) { trailCanvas.remove(); trailCanvas = null; trailCtx = null; }
  trailPoints = [];
  expression = null;
}

chrome.storage.sync.get(DEFAULTS, (data) => {
  if (data.moteEnabled) setTimeout(startMote, 1000);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.moteEnabled) {
    changes.moteEnabled.newValue ? startMote() : stopMote();
  }
});

// ── Right-click "Hide posts like this" → adds selection/nearby text as block phrase ──

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "addBlockPhrase") {
    // Use selected text, or fall back to text near where they clicked
    let text = window.getSelection()?.toString()?.trim();

    if (!text && lastContextTarget) {
      // Walk up to find meaningful text (post title, tweet text, caption, etc.)
      const el = lastContextTarget.closest(
        '[data-testid="tweetText"], #video-title, h3, [alt], article, a[href*="/p/"]'
      );
      if (el) {
        text = el.getAttribute("alt") || el.textContent || "";
        text = text.trim().slice(0, 80);
      }
    }

    if (!text) return;

    // Prompt isn't available in content scripts, so just use the first few words
    const phrase = text.toLowerCase().replace(/\s+/g, " ").slice(0, 60);

    chrome.storage.sync.get(DEFAULTS, (data) => {
      if (!data.phrases.includes(phrase)) {
        data.phrases.push(phrase);
        chrome.storage.sync.set({ phrases: data.phrases });
        console.log(`[Braintrot] Added block phrase: "${phrase}"`);
      }
    });
  }
});

let lastContextTarget = null;
document.addEventListener("contextmenu", (e) => {
  lastContextTarget = e.target;
});

console.log(`[Braintrot] Active on ${currentSite}`);
