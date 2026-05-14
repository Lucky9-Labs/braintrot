# Braintrot

A Chrome extension that replaces spoiler posts on Instagram, YouTube, and X/Twitter with vocabulary quiz cards. Instead of accidentally seeing spoilers, you learn a new word.

![Logo](logo.svg)

## Install

1. Download or clone this repo
2. Open `chrome://extensions` in Chrome
3. Toggle **Developer mode** on (top right)
4. Click **Load unpacked**
5. Select the `extension` folder
6. Done — visit Instagram, YouTube, or X to see it in action

## Usage

**Add block phrases** — Click the Braintrot extension icon in your toolbar to open the popup. Type phrases you want to filter (e.g. "game of thrones", "finale") and click Add. Any post whose caption, title, or text matches a phrase gets replaced with a vocab quiz card.

**Right-click to block** — Select text on any post, right-click, and choose "Braintrot: hide posts like this" to instantly add it as a block phrase.

**Whitelist accounts** — Add handles in the popup to exempt specific accounts from filtering.

**Quiz cards** — Each card shows a word with three definition choices. Pick the right one for confetti + the definition reveal. A glowing mote companion orbits the active card and reacts to your answers.

**Pronunciation** — Cards with audio show a speaker button next to the word. Click it to hear the pronunciation.

## How it works

- Content script scans posts on Instagram (feed + explore), YouTube (home, search, watch, shorts), and X/Twitter
- Matching posts get overlaid with a vocab quiz card
- Words and definitions come from the [Free Dictionary API](https://dictionaryapi.dev/) — fetched in batches by a background service worker and cached locally
- Settings sync across devices via `chrome.storage.sync`
- A spring-physics mote companion orbits the active card, shakes its head on wrong answers, and celebrates on correct ones

## Sites supported

| Site | What it scans |
|------|--------------|
| Instagram | Feed posts, Explore grid, Reels |
| YouTube | Home feed, Search results, Watch page, Sidebar, Shorts |
| X / Twitter | Timeline tweets |

## Structure

```
README.md
extension/
  manifest.json     Extension config
  content.js        Site adapters, quiz cards, mote companion
  content.css       Card styles, animations
  background.js     Dictionary API fetching, quiz cache, context menu
  popup.html/js     Settings UI
  words.js          Curated word list (400+ words)
  logo.svg          Full wordmark
  icon.svg          App icon (handwritten "trot")
```
