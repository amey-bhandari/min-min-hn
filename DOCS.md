# Roadmap

integrate AI!!!!

# MINHN

MINHN is a minimum Hacker News viewer.

- Single page only.
- Shows only a list of links to Hacker News discussion pages.
- No comment counts, vote counts, author names, or other metadata.
- Displays up to 10 headlines from a fixed 24-hour window (midnight-to-midnight, Eastern Time).
- Date selection is a plain horizontal row of day links for the latest 7 ET days, not a date picker.

## Run

Because this is a static app, use any simple web server from the `src` folder.

```bash
cd src
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at
`.github/workflows/deploy.yml` that publishes this static site.

One-time setup in GitHub:

1. Go to **Settings -> Pages** for the repository.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `master` and wait for the **Deploy to GitHub Pages** workflow to finish.

After deployment, the site is available at:

- `https://<your-username>.github.io/<repo-name>/`

## Data source

Uses the official Hacker News Firebase API:

- [Hacker News API docs](https://github.com/HackerNews/API)

Implementation detail:

- MINHN fetches `topstories` and returns the first 10 stories whose `time` falls inside the selected fixed day window in Eastern Time (`America/New_York`, with DST handled automatically).
