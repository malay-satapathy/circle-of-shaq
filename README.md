# 🔥 CIRCLE OF SHAQ
> **"Rise and shine, it's dhokha time…"**  
> The Next-Generation Multiplayer Social Deduction Party Game for **3 to 24+ Players**.

---

## 🎯 Why We Built Circle of Shaq (Fixing Every `spyfall.co` Loophole)

We reverse-engineered `spyfall.co`'s production bundle and live REST APIs and discovered **12 critical security, gameplay, and UX loopholes**—all solved in **Circle of Shaq**:

| # | `spyfall.co` Loophole / Bug | How **CIRCLE OF SHAQ** Fixes It |
| :- | :--- | :--- |
| **1** | **Unauthenticated Room Deletion on Join "Back" Button** (`DELETE /api/rooms/:id`) | Safe navigation that **never** destroys an active room when a user clicks Back. |
| **2** | **Plaintext Spy & Location Leaks in Network Tab** (`GET /api/rooms/:id/players` exposes `is_spy: true`) | **Zero-Leak Architecture**: Public room state strips all secret fields; each client only receives their own private role payload. |
| **3** | **Physical Screen-Tell Between Spy & Regular Player** (Spy has no Suspects Board; Agents have no Location Grid) | **Unified Workspace**: Both Spies and Agents have the exact same layout (Suspects Board + Locations Matrix + Neutral Card Frame) so glancing at a screen reveals nothing! |
| **4** | **Broken Restarts ("One More Round" reuses old cards & "Play Again" kills the room)** | **1-Click Instant Next Round**: Deals a fresh subset of cards, keeps all players & scores, applies anti-streak spy weighting, and supports Podium Rematches in the same room. |
| **5** | **Browser Refresh (`F5`) Crashes Game (`location.state` lost)** | Full `sessionStorage` state & token recovery—refreshing mid-round seamlessly restores your exact role and timer. |
| **6** | **All 10 Clients Fire `POST /end-round` Simultaneously** | Host/Server-authoritative monotonic timer loop eliminates race conditions and clock-skew bugs. |
| **7** | **Missing Mid-Round Spy Reveal ("Blow Cover")** | Added the **"Blow Cover & Guess Location"** button so any Gaddar (Spy) can interrupt mid-round for a high-stakes +2 pt steal! |
| **8** | **No Mid-Round Accusation Call** | Added the **"Shaq Siren (Vote)"** button so any player can pause the clock mid-round and trigger a Circle Vote. |
| **9** | **Bandwagon "Sheep Voting" via Live Vote Badges** | Added **Blind Majority Voting** (default) so individual vote counts stay hidden until all votes are locked in. |
| **10** | **Hardcoded 10-Player Cap & Cluttered 112px Textareas** | Scales from **3 to 24+ players** with **1, 2, or 3 Spies (or Auto-Scale)** and compact player pills with expandable quick-notes. |
| **11** | **No Question Turn Tracking ("Who Just Asked Whom?")** | Built-in **Live Question Floor ("Pass the Mic")** that tracks how many times each player was questioned and enforces the *No Immediate Ask-Backs* rule! |
| **12** | **Broken Deck Data ("Military Base" had "Spy" as an innocent role; "Tuna" & "Cheetah" were "Cold-blooded lizards")** | **4 Curated, Bug-Free Decks** including our exclusive **Desi Adda & Shaadi** deck! |

---

## 🃏 Included Decks

1. **🕵️‍♂️ Classic Locations (36 Cards)**: Refined, bug-free edition with 6 authentic roles per location.
2. **🌶️ Desi Adda & Shaadi (24 Cards)**: Exclusive Indian chaos deck—*Big Fat Indian Shaadi, Tapri Chai Stall, Indian Railways Sleeper Coach, Goa Beach Shack, Housing Society AGM, Sarojini Market, IPL Stadium, Bangalore Tech Park*, and more!
3. **🐾 Wild Kingdom (28 Cards)**: Biologically accurate animal roles where you hunt the Poacher.
4. **🌍 World Nations (24 Cards)**: Authentic cultural roles across 24 countries where you uncover the Double Agent.

---

## 🚀 Running Locally & Deploying to GitHub Pages

### 1. Local Development
```bash
npm install
npm run dev
```

### 2. Optional Dedicated Socket.IO Server
```bash
npm run dev:server
```

### 3. Deploy to GitHub Pages
The app includes **Serverless WebRTC P2P (`PeerJS`) + Multi-Tab `BroadcastChannel` + 1-Phone Couch Pass-and-Play**, so multi-device rooms work 100% live on static **GitHub Pages** without needing a paid backend!
```bash
npm run deploy
```
Or push to `main` to trigger the included GitHub Actions workflow (`.github/workflows/deploy.yml`).
