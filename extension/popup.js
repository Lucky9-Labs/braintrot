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
    const prefix = type === "account" ? "@" : "";
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

function normalizeSubredditInput(value) {
  let val = value.trim().toLowerCase();
  const match =
    val.match(/^https?:\/\/(?:www\.|old\.|new\.|m\.)?reddit\.com\/r\/([a-z0-9_-]+)(?:[/?#\s]|$)/) ||
    val.match(/^\/?r\/([a-z0-9_-]+)(?:[/?#\s]|$)/);
  return match ? `r/${match[1]}` : "";
}

function getMaterials(data) {
  const legacy = (data.subreddits || [])
    .map((name) => normalizeSubredditInput(name.trim().toLowerCase().startsWith("r/") ? name : `r/${name}`))
    .filter(Boolean);
  return [...new Set([...data.phrases, ...legacy])];
}

function saveMaterials(materials, callback) {
  chrome.storage.sync.set({ phrases: materials, subreddits: [] }, callback);
}

function loadAndRender() {
  chrome.storage.sync.get(DEFAULTS, (data) => {
    const materials = getMaterials(data);
    if ((data.subreddits || []).length > 0 || materials.length !== data.phrases.length) {
      saveMaterials(materials);
    }
    renderTags(materials, "phrase-list", "phrase", (item) => {
      saveMaterials(materials.filter((material) => material !== item), loadAndRender);
    });
    renderTags(data.whitelist, "account-list", "account", (item) => {
      data.whitelist = data.whitelist.filter((a) => a !== item);
      chrome.storage.sync.set({ whitelist: data.whitelist }, loadAndRender);
    });
    $("status").textContent = `${materials.length} item(s) blocked \u00b7 ${data.whitelist.length} whitelisted`;
  });
}

function addPhrase() {
  const raw = $("phrase-input").value.trim().toLowerCase();
  const val = normalizeSubredditInput(raw) || raw;
  if (!val) return;
  chrome.storage.sync.get(DEFAULTS, (data) => {
    const materials = getMaterials(data);
    if (!materials.includes(val)) {
      materials.push(val);
      saveMaterials(materials, loadAndRender);
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

$("add-phrase").addEventListener("click", addPhrase);
$("add-account").addEventListener("click", addAccount);
$("phrase-input").addEventListener("keydown", (e) => e.key === "Enter" && addPhrase());
$("account-input").addEventListener("keydown", (e) => e.key === "Enter" && addAccount());

// Mote toggle
const moteToggle = $("mote-toggle");
chrome.storage.sync.get({ moteEnabled: false }, (data) => {
  moteToggle.checked = data.moteEnabled;
});
moteToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ moteEnabled: moteToggle.checked });
});

loadAndRender();
