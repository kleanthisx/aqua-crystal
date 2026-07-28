# Aqua Crystal — Pool Water Assistant

A single-codebase PWA (Progressive Web App): opens as a normal webpage on a PC and installs like an
app on a phone. Everything works **offline** — the strip is read on-device by sampling the pad colors
from the photo and matching them against the reference chart. An optional AI double-check (free
Gemini API key) is available when online.

## What it does

- **Read a strip** — photograph a 7-in-1 test strip, drag 3 markers to align it, get all 7 values
  (Total Hardness, Total/Free Chlorine, Bromine, pH, Total Alkalinity, Cyanuric Acid).
- **Advice** — every saved reading generates step-by-step corrective actions ("add this, then that,
  retest in 4 h"), with doses scaled to *your* pool volume and compared against the chemicals you
  actually have on the shelf.
- **Log** — every entry stores date, readings, temperature, water state, notes and the advice given,
  with checkboxes to tick actions off. Export/import CSV; full JSON backup.
- **Pool profile** — volume (with a shape calculator), pump throughput (turnover/runtime advice),
  filter type and backwash/clean reminders.
- **Guide** — strip technique, sand-filter backwash steps, cartridge cleaning, balance basics, shock.
- **Calibration** — photograph the color chart on YOUR strip bottle and tap each swatch once; the
  offline reader then matches against your brand's real colors.
- **3/4/7-pad strips** — set your strip type in Pool ▸ Settings; the photo reader adapts. Values a
  cheap strip can't measure are **estimated** (marked ≈, never silently): CYA and hardness are
  bookkept from your logged doses (trichlor/dichlor/stabilizer add CYA; cal-hypo/CaCl₂ add hardness;
  refills dilute; "fresh fill" resets), and anchored whenever you do run a full test. No Total
  Chlorine pad means no combined-chlorine math — instead, logging the water state
  "chlorine smell / stinging eyes" triggers shock advice.
- **Event log** — anything that happens between readings can be logged with a past date: chemicals
  added, backwash, filter swaps, refills/rain, fresh fill, cover on/off. Dose events feed the
  estimates; backwash/filter events update the filter reminder automatically.

## Running it

Any static file server works. On this machine:

```bash
"$LOCALAPPDATA/Programs/Python/Python312/python.exe" -m http.server 8125 -d "C:/Users/e60918/Documents/Aqua Crystal"
```

Then open http://localhost:8125.

### On the phone

The camera input and the offline service worker require **HTTPS or localhost**. Options:

1. **Same Wi-Fi:** serve from the PC as above, then on the phone open `http://<pc-ip>:8125`.
   Chrome on Android treats plain-IP HTTP as insecure — camera still works via the file picker
   (choose "Camera"), but installation/offline needs HTTPS.
2. **Free static hosting** (GitHub Pages, Cloudflare Pages, Netlify): push this folder, open the
   HTTPS URL on the phone, then browser menu ▸ **Add to Home screen / Install app**. After the first
   visit it works fully offline.

## AI double-check (optional)

Get a free API key at https://aistudio.google.com → put it in **Pool ▸ AI double-check**. The key is
stored only in the browser's local storage on your device. Without a key the app is 100% offline.

## Data & files

All data lives in the browser's localStorage on the device (`aquacrystal.v1`). Use
**Log ▸ Export CSV** for the spreadsheet-style log and **Pool ▸ Backup** for a full JSON backup.
Note: clearing the browser's site data clears the app's data — keep backups.

## Disclaimers

- Dose formulas are standard rules of thumb (1 ppm = 1 g/m³ of active substance, effect factors per
  product). Always add in steps, pump running, and retest — never dose the full correction blind.
- Default chart colors approximate a generic 7-in-1 strip; calibrate from your bottle for accuracy.
