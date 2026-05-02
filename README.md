# Istefadah Venue Booking

This is a self-contained starter app for the `Istefadah Venue Booking` SRS. It includes:

- User and admin login
- 45-minute predefined time slots
- Multi-date booking in one submission
- Clash checks for same date, time slot, and venue
- Partial booking confirmation when only some selected dates are available
- Venue capacity validation against audience count
- User edit/delete window for 48 hours after booking creation
- Admin override for post-48-hour edits/deletes
- In-app notifications for users and admins
- Booking tables plus Excel, Word, and CSV downloads

## Run in VS Code

1. Open this folder in VS Code.
2. Open the terminal in VS Code.
3. Run:

```powershell
python app.py
```

4. Open `http://127.0.0.1:8000` in your browser.

You can also run it from the VS Code Run panel using the launch profile:

- `Run Istefadah Venue Booking`

## Run with one click on Windows

Double-click [run_app.bat](C:/Users/pc5/Documents/Codex/2026-04-27/app-development-srs-app-name-istefadah/run_app.bat), or run this in the terminal:

```powershell
.\run_app.bat
```

## If port 8000 is busy

Run on another port:

```powershell
$env:ISTEFADAH_PORT=8001
python app.py
```

Then open `http://127.0.0.1:8001`.

## Deploy on Render for demo

This app can be deployed on Render for a demo link that you can share with your father.

Important:

- The current app uses `SQLite`.
- On Render free web services, local file storage is not permanent.
- That means booking data may reset after restart, redeploy, or idle spin-down.
- So use Render for demo/testing, not for long-term production.

### Render steps

1. Upload this project to GitHub.
2. Sign in to Render.
3. Click `New` > `Blueprint`.
4. Connect your GitHub repository.
5. Select this repository.
6. Render will detect [render.yaml](C:/Users/pc5/Documents/Codex/2026-04-27/app-development-srs-app-name-istefadah/render.yaml).
7. Create the service.
8. Wait for deploy to finish.
9. Open the generated public Render URL.

### If you do not want to use Blueprint

1. In Render click `New` > `Web Service`.
2. Connect your GitHub repository.
3. Use these settings:

```text
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: python app.py
```

Render will automatically provide the `PORT` environment variable, and the app is already configured for that.

## Demo credentials

- Admin: `admin@istefadah.org` / `admin123`
- User: `ali@istefadah.org` / `user123`
- User: `fatema@istefadah.org` / `user123`

## Notes

- The app uses SQLite and creates `booking_app.db` automatically in this folder.
- Hijri preview is generated locally in the browser so the app can run offline. If you want direct `AajNoDin` API integration later, that can be added as a next step.
- Excel and Word downloads are produced in Office-compatible formats without extra dependencies.
