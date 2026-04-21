# F1 Pulse

This dashboard now runs through a local Python backend and uses:

- `livef1` for race timing, position, and session data
- official Formula 1 results pages for driver and team championship standings

## Run

From this folder:

```powershell
cd C:\Users\Bhavy\Documents\Codex\2026-04-20-you-are-a-professional-fullstack-developer-2
python .\server.py
```

Then open:

```text
http://127.0.0.1:8000
```

## Notes

- The project includes a local `vendor` directory with the Python packages the backend imports, so you can run `server.py` directly without setting up a separate environment first.
- The frontend no longer calls OpenF1 directly.
- Refresh cadence is handled by the backend response:
  - active race: fast refresh
  - no active race: lighter refresh
