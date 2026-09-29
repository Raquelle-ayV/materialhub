# Re:Material — HANDOFF

> Purpose: This file is the single handoff document for an AI or designer taking over the **current UI work** of Re:Material.
>
> **Important:** The project repository itself was not mounted into this chat session, so the file names below are based on the latest confirmed project structure/implementation context. Before editing, verify the exact paths against the repository. Do not invent replacement files if the repo has renamed them.

## 1. What the project is

**Re:Material** is a campus material-reuse service for design/creative students.

It combines:

- a mobile web app;
- a physical Material Hub;
- lightweight inventory and reservation rules.

It is **not** intended to be a general second-hand marketplace.

### Who uses it

There are two roles in the same system:

- **A — Material Provider:** has usable leftover creative materials and wants to put them into circulation without arranging a private handoff.
- **B — Material Receiver:** needs materials for a project and wants to check reusable stock before buying new materials.

One student can be A at one time and B at another.

### Core loop

**A: register material → bring it to the Hub → confirm placement → material becomes Available**

**B: browse/search → open material → reserve → 24-hour hold → go to Hub → scan the correct Zone → verify/find the material → confirm collection → material becomes Collected**

The key product idea is that the digital status must correspond to a real physical state.

### Current service model

The physical Hub uses:

- open shelves/tables;
- simple Zones;
- Zone QR codes;
- short Material Numbers such as `#42`;
- inexpensive printed labels.

There are no smart lockers and no required QR code on every individual material.

---

## 2. Technical stack and local preview

### Stack

- **Frontend:** React + TypeScript
- **Backend:** Node.js + Express
- **Database:** SQLite
- **Frontend development server:** Vite-style dev server
- **Current target:** mobile-first web app, approximately iPhone 16 Pro width
- **Layout constraint:** should work down to about 320px without horizontal overflow
- **UI language:** English

### Local URLs

The current development setup has been reported as:

- Frontend: `http://localhost:5173`
- API health check: `http://localhost:3001/api/health`

### Start command

From the project root, the current documented command is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 dev
```

If this command has changed in the repository, use the actual `package.json` scripts as the source of truth rather than creating another startup method.

### Before changing UI

Run the project and confirm:

1. the frontend opens;
2. the API health check responds;
3. the existing navigation works;
4. the current A and B flows can be opened.

Do not start by rewriting the app.

---

## 3. UI-related file structure

The project is organized conceptually as a single repo with separated frontend/backend responsibilities.

### Frontend

| Path | Purpose |
|---|---|
| `frontend/src/pages/` | Main screens/pages: Explore, material detail, Share/Deposit flow, reservation flow, Hub/scan flow, Profile, auth, etc. |
| `frontend/src/components/` | Reusable UI components such as cards, buttons, inputs, navigation, status elements and shared interaction patterns. |
| `frontend/src/features/` | Flow-specific logic for auth, materials, deposits, reservations and credits. |
| `frontend/src/services/` | API calls, uploads and frontend/server communication. |
| `frontend/src/styles/` | Global styles, spacing, colors, typography and responsive/mobile rules. |
| `frontend/src/App.*` | Application shell/routing/navigation entry; exact extension/path should be verified in the repo. |
| `frontend/package.json` | Frontend dependencies and scripts. |
| `frontend/vite.config.*` | Frontend dev/build configuration, if present. |

### Root / shared configuration

| Path | Purpose |
|---|---|
| `package.json` | Root scripts/dependencies, if the repo uses a root package file. |
| `scripts/start.ps1` | Current documented development startup script. |
| `shared/` | Shared API types/status enums/field contracts, if present. Do not alter for visual-only work. |

### Backend — usually DO NOT TOUCH for visual work

| Path | Purpose |
|---|---|
| `backend/src/routes/` | API routes and request validation. |
| `backend/src/services/` | Inventory, reservation, credit and business rules. |
| `backend/src/db/` | SQLite schema/migrations/demo data. |
| `backend/src/middleware/` | Authentication/permission/error handling. |
| `backend/src/jobs/` | Reservation expiration/cleanup logic. |

> **Path verification rule:** if the actual repo differs from the structure above, inspect the real tree and update this file rather than creating duplicate architecture.

---

## 4. Current completed functionality / progress

The implementation is no longer an empty prototype.

### Already implemented / substantially implemented

- React + TypeScript frontend
- Express backend
- SQLite database
- registration
- login/logout
- one-time signup credit
- credit ledger/history
- Explore/material browsing
- material detail
- Share Material / A-side flow
- material registration
- unique material number
- Ready for drop-off / pending-storage state
- Hub guide
- Zone QR scan stage
- placement photo stage
- drop-off completion
- +1 credit after successful placement
- B-side reservation flow
- 1/2-item selection where supported by the current implementation
- 24-hour reservation concept
- reservation status
- inventory state transitions
- Profile
- credit history
- mobile navigation
- responsive/mobile constraints
- browser/build/backend checks have previously been run successfully

### Current important state model

The product distinguishes:

`Ready for drop-off → Available → Reserved → Collected`

A submission alone must **not** make a material reliably Available.

B reservation does **not** mean collection.

The material becomes `Collected` only after the at-Hub confirmation step.

### Current progress status

The product is now moving from:

**“make the service function”**

toward:

**“make the existing service visually coherent, usable and portfolio-ready.”**

The current priority is UI refinement and verification, not adding random features.

---

## 5. Remaining UI tasks

These are the current visual/product tasks. They should be handled by inspecting the existing implementation first and then editing the smallest relevant files.

### Task 1 — Establish one coherent visual system

**Likely files:**

- `frontend/src/styles/`
- `frontend/src/components/`
- existing design-token/style files in the repo

Current problem:

The UI has been functional, but the visual language can still feel too generic / AI-generated.

Goal:

- credible product UI;
- clean and contemporary;
- human rather than “AI demo” looking;
- consistent typography;
- consistent spacing;
- consistent radius;
- consistent buttons/inputs/cards;
- clear hierarchy.

Do not redesign every screen independently.

If a repeated pattern is wrong, fix the shared component/token first.

---

### Task 2 — Improve Explore / home screen

**Likely files:**

- Explore/Home page in `frontend/src/pages/`
- material-card component in `frontend/src/components/`
- global styles/tokens

Check:

- primary action hierarchy;
- search;
- category/filter presentation;
- material cards;
- A-side pending task card;
- B-side reserved-for-pickup card;
- bottom navigation;
- spacing and density.

The screen should make the next action obvious without looking like a marketplace clone.

---

### Task 3 — Improve material cards and detail page

**Likely files:**

- material card component in `frontend/src/components/`
- material detail page in `frontend/src/pages/`
- related material styles

Cards should communicate only the information needed for quick scanning:

- image;
- material name;
- quantity/size where relevant;
- material number;
- Zone;
- current availability.

Detail page should clearly separate:

- what the material is;
- where it is;
- current status;
- what the user can do next;
- the 1-credit reservation requirement where applicable.

Do not introduce cash prices.

---

### Task 4 — Refine A-side Share / Drop-off screens

**Likely files:**

- Share/Deposit pages in `frontend/src/pages/`
- form/input/upload components in `frontend/src/components/`
- related feature logic in `frontend/src/features/`

Priority screens:

1. Share Material overview
2. Add Information
3. Material Recorded / Ready for drop-off
4. Drop-off Guide
5. Scan Zone
6. Place Material
7. Material Confirmed

The three-stage progress model should remain understandable.

Do not add extra screens just to make the flow look more sophisticated.

The user should always know:

- current stage;
- what is already completed;
- what to do next;
- whether the material is actually Available yet.

---

### Task 5 — Refine B-side reservation / pickup screens

**Likely files:**

- reservation pages in `frontend/src/pages/`
- reservation/material components
- related feature logic

Priority screens:

1. Material detail
2. Confirm Reservation
3. Reservation Confirmed
4. Pickup Guide
5. I’m at Hub / Scan Zone
6. Material verification
7. Collection success

The 24-hour deadline must remain visually obvious.

The UI must not imply:

`Reserve = Collected`

The user should see the distinction between:

- Reserved;
- still needs pickup;
- successfully Collected.

---

### Task 6 — Refine Hub / QR / physical-world instructions

**Likely files:**

- Hub guide/scan pages in `frontend/src/pages/`
- shared instruction/step components
- relevant styles

These screens are especially important because they connect the digital interface to the physical space.

Prioritize:

- clear location hierarchy;
- Zone name;
- Material Number;
- simple instructions;
- correct error feedback;
- obvious next action.

Avoid decorative complexity.

---

### Task 7 — Responsive/mobile QA

**Likely files:**

- global styles;
- page-level styles;
- reusable components with fixed widths/heights.

Verify at minimum:

- ~320px;
- common phone width;
- ~402px / iPhone 16 Pro target.

Check especially:

- long material names;
- long form labels;
- keyboard/input states;
- image upload;
- bottom buttons;
- scan screens;
- cards;
- fixed navigation;
- no horizontal scrolling.

---

## 6. Known bugs / pitfalls / decisions

### Known or unresolved product issues

1. **B-side physical pickup has not been fully verified end-to-end.**
   Reservation works, but the complete Hub QR → material verification → collection path still needs real verification.

2. **Material verification method has had two competing descriptions.**
   One version uses the placement photo for checking; another uses Material Number input. Do **not** implement both just because both appear in old documents. The final B8 method must be selected before changing the underlying acceptance logic.

3. **Reservation expiration is not something the UI should fake.**
   The service rule is 24 hours, but the exact pilot automation/manual process must match the actual implementation.

4. **Post-collection return/refund rules are not fully settled.**
   Do not invent a refund flow while doing visual work.

5. **A Placement Photo has had optional/required ambiguity.**
   Do not change validation rules merely while polishing the UI.

### Important design decisions

- 24-hour hold instead of a very short hold because students may not be able to reach the Hub immediately.
- Short Material Number retained because open shelves need a simple physical reference.
- Zone QR instead of QR on every material to reduce physical setup burden.
- No smart lockers.
- No cash transaction.
- No private chat as the core handoff.
- No ratings/ranking/social feed in the first version.
- AI recognition is not the core value proposition.
- Physical availability must be confirmed before a material is treated as Available.
- Reservation and collection are separate states.
- Mobile-first, minimal interface.
- Do not add screens unless they support a necessary decision, real-world transition or error prevention.

### Design pitfall

Do not make the product visually resemble a generic “AI sustainability” concept.

The interface should look like a credible service product used by students in a real campus environment.

---

## 7. Do not change these areas during UI-only work

Unless a task explicitly requires it, do **not** modify:

### Data model

Do not change:

- Material;
- Deposit;
- Reservation;
- CreditAccount;
- CreditEntry;
- Zone;
- Media / MaterialPhoto relationships.

### API contracts

Do not casually rename/change:

- endpoints;
- request fields;
- response fields;
- status values;
- IDs;
- upload contracts.

### Business rules

Do not change:

- 24-hour reservation;
- one active reservation per material;
- credit freezing/consumption behavior;
- A-side +1 credit after successful drop-off;
- Available/Reserved/Collected state semantics;
- duplicate return/refund protection;
- concurrent reservation behavior.

### Physical-service rules

Do not introduce:

- smart lockers;
- item-level QR requirement;
- cash payment;
- private messaging as the main handoff;
- complex reward shop;
- unnecessary public-space infrastructure.

### Scope

Do not add features merely because the app feels “too simple.”

If a new feature seems necessary, explain:

1. what user problem it solves;
2. why the current system cannot solve it;
3. which A/B/Hub/backend states it affects.

---

## 8. How to work on the UI

Before editing:

1. Read this file.
2. Inspect the real repo tree.
3. Run the app.
4. Identify the actual page/component/style files.
5. Compare implementation with this handoff.
6. Make one coherent visual change set.
7. Run build/checks.
8. Check the result at mobile widths.
9. Do not rewrite working business logic.

When a shared component controls multiple screens, prefer fixing the shared component over duplicating CSS.

When uncertain whether a requirement is current or historical, treat the current implementation + this handoff as the starting point and ask before making a major product decision.

---

## 9. If only 5–10 files can be shared for UI work

Because the exact current repository tree was not mounted in this session, use the following **roles** to select the actual files in the repo:

1. **App/root routing file** — usually `frontend/src/App.tsx` or equivalent.
2. **Main/global stylesheet** — the file that controls global layout, typography, colors and responsive rules.
3. **Design tokens file** — e.g. `frontend/src/styles/design-tokens.css`, if present.
4. **Shared component file(s)** — the main reusable Button/Card/Input/navigation component files.
5. **Explore/Home page** — the main screen.
6. **Material Detail page** — shows the core content/card/detail visual language.
7. **Share/Add Information page** — represents the A-side form system.
8. **Reservation/Confirm page** — represents the B-side action system.
9. **Hub/Scan page** — represents the physical-digital interaction.
10. **This `HANDOFF.md`** — the context/constraints document.

If limited to only **5 files**, prioritize:

1. App/root routing
2. global stylesheet/design tokens
3. shared components
4. Explore/Home
5. one representative flow page (preferably the most important page currently being redesigned)

Do **not** use the backend, database, migrations or API route files as part of a UI-only handoff unless the recipient specifically needs them to understand an existing UI/API dependency.

---

## 10. Final rule for the next AI

The current project is already functional enough that the next person should **not start over**.

Start by:

> **inspect → run → identify existing UI system → improve shared visual language → refine screens → test**

Do not:

> **invent new product → rebuild architecture → change data model → add features**

The objective of the next stage is to make the existing Re:Material product **visually coherent, usable, realistic and portfolio-ready**, while preserving the service logic that has already been established.
