# SSK desk

Dashboard at `/`. Scan page at `/scan`. Local start: `npm start` (port 4177).

## Vercel

Import https://github.com/sarmandfarhad/ssk and set the project Root Directory to `qr-desk`.

The QR code uses the public host of the request. Scanning works at any time. The 8:30 AM–5:00 PM Baghdad lock is still in the code and is turned off.

## One storage step

`data.json` is only the starting copy. On Vercel, open the project Storage tab, choose Create Storage, then Blob, set access to Private, and connect that store to this project. Redeploy once. IDs stick after that. Until the store is connected, the site still opens and shows the seeded IDs, and saving returns an error.
