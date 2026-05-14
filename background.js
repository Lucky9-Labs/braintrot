const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const BATCH_SIZE = 20; // how many quiz entries to keep ready
const REFILL_AT = 5;   // fetch more when cache drops below this

// Import the word list
importScripts("words.js");

// ── Fetch a definition from the Free Dictionary API ──

async function fetchDefinition(word) {
  const res = await fetch(API_BASE + encodeURIComponent(word));
  if (!res.ok) return null;
  const data = await res.json();
  // Grab the first short definition
  // Extract phonetic text and audio URL
  let phonetic = "";
  let audioUrl = "";
  for (const entry of data) {
    if (!phonetic && entry.phonetic) phonetic = entry.phonetic;
    for (const p of entry.phonetics || []) {
      if (!phonetic && p.text) phonetic = p.text;
      if (!audioUrl && p.audio) audioUrl = p.audio;
    }
    for (const meaning of entry.meanings || []) {
      for (const def of meaning.definitions || []) {
        const text = def.definition;
        if (text && text.length < 120 && text.length > 10) {
          return { word, definition: text, partOfSpeech: meaning.partOfSpeech, phonetic, audioUrl };
        }
      }
    }
  }
  return null;
}

// ── Shuffle helper ──

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Build a batch of quiz entries ──

async function buildBatch(count) {
  const candidates = shuffle([...WORD_LIST]).slice(0, count * 3);
  const results = [];

  for (const word of candidates) {
    if (results.length >= count) break;
    try {
      const entry = await fetchDefinition(word);
      if (entry) results.push(entry);
    } catch (e) {
      // skip failed words
    }
  }

  if (results.length < 3) return []; // need at least 3 for wrong-answer pool

  // Assemble quiz entries: each gets 2 wrong answers from other entries' definitions
  const quizEntries = results.map((entry, i) => {
    const others = results.filter((_, j) => j !== i);
    const wrongPicks = shuffle(others).slice(0, 2);
    return {
      word: entry.word,
      definition: entry.definition,
      phonetic: entry.phonetic || "",
      audioUrl: entry.audioUrl || "",
      wrong: wrongPicks.map((w) => w.definition),
    };
  });

  return quizEntries;
}

// ── Cache management ──

async function getCache() {
  const data = await chrome.storage.local.get({ quizCache: [], lastFetch: 0 });
  return data;
}

async function refillCache() {
  const { quizCache } = await getCache();
  if (quizCache.length >= REFILL_AT) return; // still have enough

  console.log("[Braintrot BG] Refilling cache...");
  const newEntries = await buildBatch(BATCH_SIZE);
  if (newEntries.length === 0) {
    console.log("[Braintrot BG] API fetch failed, keeping existing cache");
    return;
  }

  // Merge with remaining cache, dedup by word
  const seen = new Set(quizCache.map((e) => e.word));
  const merged = [...quizCache];
  for (const e of newEntries) {
    if (!seen.has(e.word)) {
      merged.push(e);
      seen.add(e.word);
    }
  }

  await chrome.storage.local.set({ quizCache: merged, lastFetch: Date.now() });
  console.log(`[Braintrot BG] Cache now has ${merged.length} entries`);
}

// ── Message handler: content script requests a word ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getQuizEntry") {
    (async () => {
      const { quizCache } = await getCache();
      if (quizCache.length > 0) {
        // Pop one off the front
        const entry = quizCache.shift();
        await chrome.storage.local.set({ quizCache });
        sendResponse({ entry });

        // Refill in background if running low
        if (quizCache.length < REFILL_AT) {
          refillCache();
        }
      } else {
        // No cache — return null, content script uses fallback
        sendResponse({ entry: null });
        refillCache();
      }
    })();
    return true; // keep channel open for async response
  }
});

// ── Fill cache on install and periodically ──

chrome.runtime.onInstalled.addListener(() => {
  // Clear stale cache entries that may lack phonetic data
  chrome.storage.local.set({ quizCache: [], lastFetch: 0 }, () => {
    refillCache();
  });

  // Context menu for blocking content
  chrome.contextMenus.create({
    id: "braintrot-block",
    title: "Braintrot: hide posts like this",
    contexts: ["all", "selection"],
    documentUrlPatterns: [
      "https://www.instagram.com/*",
      "https://www.youtube.com/*",
      "https://x.com/*",
      "https://twitter.com/*",
    ],
  });
});

chrome.runtime.onStartup.addListener(() => {
  refillCache();
});

// Also refill when an alarm fires (every 6 hours)
chrome.alarms?.create?.("refill", { periodInMinutes: 360 });
chrome.alarms?.onAlarm?.addListener?.((alarm) => {
  if (alarm.name === "refill") refillCache();
});

// ── Context menu: dismiss a word ──

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "braintrot-block" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "addBlockPhrase" }).catch(() => {
      // Content script not loaded on this page — use selected text directly
      if (info.selectionText) {
        const phrase = info.selectionText.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
        if (!phrase) return;
        chrome.storage.sync.get({ phrases: [], whitelist: [] }, (data) => {
          if (!data.phrases.includes(phrase)) {
            data.phrases.push(phrase);
            chrome.storage.sync.set({ phrases: data.phrases });
          }
        });
      }
    });
  }
});

console.log("[Braintrot BG] Service worker loaded");
