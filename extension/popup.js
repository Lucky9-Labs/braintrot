const DEFAULTS = {
  phrases: [],
  whitelist: [],
  subreddits: [],
};

const $ = (id) => document.getElementById(id);

function renderTags(list, containerId, type, onRemove) {
  const container = $(containerId);
  container.innerHTML = "";
  if (list.length === 0) {
    container.innerHTML = `<div class="empty">None yet</div>`;
    return;
  }
  for (const item of list) {
    const tag = document.createElement("span");
    tag.className = `tag ${type}`;
    const prefix = type === "account" ? "@" : type === "subreddit" ? "r/" : "";
    const label = document.createTextNode(prefix + item);
    tag.appendChild(label);
    const remove = document.createElement("span");
    remove.className = "remove";
    remove.textContent = "\u00d7";
    remove.addEventListener("click", () => onRemove(item));
    tag.appendChild(remove);
    container.appendChild(tag);
  }
}

function loadAndRender() {
  chrome.storage.sync.get(DEFAULTS, (data) => {
    renderTags(data.phrases, "phrase-list", "phrase", (item) => {
      data.phrases = data.phrases.filter((p) => p !== item);
      chrome.storage.sync.set({ phrases: data.phrases }, loadAndRender);
    });
    renderTags(data.subreddits, "subreddit-list", "subreddit", (item) => {
      data.subreddits = data.subreddits.filter((name) => name !== item);
      chrome.storage.sync.set({ subreddits: data.subreddits }, loadAndRender);
    });
    renderTags(data.whitelist, "account-list", "account", (item) => {
      data.whitelist = data.whitelist.filter((a) => a !== item);
      chrome.storage.sync.set({ whitelist: data.whitelist }, loadAndRender);
    });
    $("status").textContent = `${data.phrases.length} phrase(s) blocked \u00b7 ${data.subreddits.length} subreddit(s) blocked \u00b7 ${data.whitelist.length} whitelisted`;
  });
}

function addPhrase() {
  const val = $("phrase-input").value.trim().toLowerCase();
  if (!val) return;
  chrome.storage.sync.get(DEFAULTS, (data) => {
    if (!data.phrases.includes(val)) {
      data.phrases.push(val);
      chrome.storage.sync.set({ phrases: data.phrases }, loadAndRender);
    }
    $("phrase-input").value = "";
  });
}

function addAccount() {
  let val = $("account-input").value.trim().toLowerCase().replace(/^@/, "");
  if (!val) return;
  chrome.storage.sync.get(DEFAULTS, (data) => {
    if (!data.whitelist.includes(val)) {
      data.whitelist.push(val);
      chrome.storage.sync.set({ whitelist: data.whitelist }, loadAndRender);
    }
    $("account-input").value = "";
  });
}

function addSubreddit() {
  let val = $("subreddit-input").value.trim().toLowerCase();
  val = val.replace(/^https?:\/\/(?:www\.|old\.|new\.|m\.)?reddit\.com\/r\//, "");
  val = val.replace(/^\/?r\//, "").split(/[/?#\s]/, 1)[0];
  if (!/^[a-z0-9_-]+$/.test(val)) return;
  chrome.storage.sync.get(DEFAULTS, (data) => {
    if (!data.subreddits.includes(val)) {
      data.subreddits.push(val);
      chrome.storage.sync.set({ subreddits: data.subreddits }, loadAndRender);
    }
    $("subreddit-input").value = "";
  });
}

$("add-phrase").addEventListener("click", addPhrase);
$("add-account").addEventListener("click", addAccount);
$("add-subreddit").addEventListener("click", addSubreddit);
$("phrase-input").addEventListener("keydown", (e) => e.key === "Enter" && addPhrase());
$("account-input").addEventListener("keydown", (e) => e.key === "Enter" && addAccount());
$("subreddit-input").addEventListener("keydown", (e) => e.key === "Enter" && addSubreddit());

// Mote toggle
const moteToggle = $("mote-toggle");
chrome.storage.sync.get({ moteEnabled: false }, (data) => {
  moteToggle.checked = data.moteEnabled;
});
moteToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ moteEnabled: moteToggle.checked });
});

loadAndRender();
