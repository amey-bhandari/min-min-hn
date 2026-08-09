# Roadmap

integrate AI!!!!

# MINHN

MINHN is a minimum Hacker News viewer.

- Single page only.
- Shows only a list of links to articles.
- Falls back to the Hacker News discussion page for posts without an article URL.
- No comment counts, author names, or other metadata.
- Displays up to 15 stories from a fixed 24-hour window (midnight-to-midnight, Pacific Time), ranked by points descending.
- Date selection is a plain horizontal row of day links for the latest 3 completed PT days, not a date picker.
- Classifies headlines into `news/development` or `blog/advice/cool-stuff`, with filters for each bucket.
- Corrections are stored locally in the browser and used to adjust future title classifications on that device.
- Shows a per-visit wall-clock timer that continues through background-tab time and resets on reload.

## Run

Because this is a static app, use any simple web server from the repo root and point it at `src`.

```bash
python3 -m http.server 8000 --directory src
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

Uses the public Hacker News search index:

- [HN Search API](https://hn.algolia.com/api)

Implementation detail:

- MINHN fetches all stories whose `created_at_i` falls inside the selected fixed day window in Pacific Time (`America/Los_Angeles`, with DST handled automatically), sorts them by `points` descending, and displays the top 10.
- Rankings reflect the stories' current HN points, not a historical end-of-day score snapshot.
