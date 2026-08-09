const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const MAX_HEADLINES = 15;
const SEARCH_PAGE_SIZE = 1000;
const DATE_LINK_DAYS = 3;
const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const CLASSIFIER_STORAGE_KEY = "min-min-hn.classifier.v1";
const CATEGORY_ALL = "all";
const CATEGORY_NEWS = "news-development";
const CATEGORY_BLOG = "blog-advice-cool-stuff";
const CLASSIFIER_CATEGORIES = [CATEGORY_NEWS, CATEGORY_BLOG];
const NEWS_CUES = [
  { pattern: /\bannounce[sd]?\b/i, weight: 3 },
  { pattern: /\brelease[sd]?\b/i, weight: 3 },
  { pattern: /\blaunch(?:es|ed)?\b/i, weight: 3 },
  { pattern: /\bavailable\b/i, weight: 2 },
  { pattern: /\bintroduc(?:es|ed|tion)\b/i, weight: 3 },
  { pattern: /\bnew\b.*\b(?:model|version|tool|framework|library)\b/i, weight: 3 },
  { pattern: /\bversion\s+\d/i, weight: 3 },
  { pattern: /\bopen[- ]sourc(?:es|ed|ing)\b/i, weight: 2 },
  { pattern: /\brolls? out\b/i, weight: 3 },
  { pattern: /\bacquires?\b|\bacquisition\b/i, weight: 3 },
  { pattern: /\bdiscov(?:er|ery|ered)\b/i, weight: 2 },
  { pattern: /\b(?:breach|outage|vulnerability|incident)\b/i, weight: 3 },
  { pattern: /\b(?:funding|investment|raises?)\b/i, weight: 2 },
];
const BLOG_CUES = [
  { pattern: /\bhow (?:i|we|to)\b/i, weight: 3 },
  { pattern: /\bwhy\b/i, weight: 2 },
  { pattern: /\b(?:guide|tutorial|walkthrough)\b/i, weight: 3 },
  { pattern: /\blessons?\b/i, weight: 3 },
  { pattern: /\badvice\b|\bthoughts?\b|\bopinion\b/i, weight: 3 },
  { pattern: /\bmy (?:experience|journey|take)\b/i, weight: 3 },
  { pattern: /\b(?:build(?:ing)?|made|built|tried)\b/i, weight: 2 },
  { pattern: /\b(?:essay|case study|explained)\b/i, weight: 2 },
  { pattern: /\bshow hn\b/i, weight: 2 },
];
const CLASSIFIER_STOP_WORDS = new Set([
  "about",
  "after",
  "and",
  "are",
  "for",
  "from",
  "how",
  "into",
  "that",
  "the",
  "this",
  "with",
  "your",
]);
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dateNav = document.getElementById("dateNav");
const statusText = document.getElementById("status");
const sessionTimer = document.getElementById("sessionTimer");
const headlinesList = document.getElementById("headlines");
const filterBar = document.getElementById("filterBar");
const sessionStartedAt = Date.now();
let classifierState = loadClassifierState();
let selectedFilter = CATEGORY_ALL;
let currentStories = [];
let selectedDateValue = "";

function parseIsoDate(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return { year, month, day };
}

function formatIsoDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getPacificDateParts(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
    day: Number(parts.find((part) => part.type === "day").value),
  };
}

function shiftIsoDate(dateValue, days) {
  const { year, month, day } = parseIsoDate(dateValue);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);

  return formatIsoDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function getTimeZoneOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});

  const utcTimestampFromTimeZoneClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return utcTimestampFromTimeZoneClock - date.getTime();
}

function zonedMidnightToUtcMs(dateValue, timeZone) {
  const { year, month, day } = parseIsoDate(dateValue);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const guessDate = new Date(utcGuess);
  const offsetMs = getTimeZoneOffsetMs(guessDate, timeZone);
  return utcGuess - offsetMs;
}

function toUnixSeconds(milliseconds) {
  return Math.floor(milliseconds / 1000);
}

function formatDateLinkLabel(dateValue) {
  const { month, day } = parseIsoDate(dateValue);
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

function buildDateLinks(todayIso) {
  dateNav.textContent = "";
  const firstDate = shiftIsoDate(todayIso, -(DATE_LINK_DAYS - 1));

  for (let index = 0; index < DATE_LINK_DAYS; index += 1) {
    const dateValue = shiftIsoDate(firstDate, index);
    const link = document.createElement("a");
    link.href = "#";
    link.dataset.date = dateValue;
    link.textContent = formatDateLinkLabel(dateValue);
    dateNav.appendChild(link);
  }
}

function setActiveDateLink(dateValue) {
  const links = dateNav.querySelectorAll("a[data-date]");

  for (const link of links) {
    const isActive = link.dataset.date === dateValue;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "date");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function normalizeArticleUrl(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function getStorySource(url) {
  if (!url) {
    return "news.ycombinator.com";
  }

  return new URL(url).hostname.replace(/^www\./, "");
}

function setStatus(message, { inProgress = false } = {}) {
  statusText.textContent = message;
  statusText.classList.toggle("in-progress", inProgress);
}

function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateSessionTimer() {
  sessionTimer.textContent = formatElapsedTime(Date.now() - sessionStartedAt);
}

function loadClassifierState() {
  const emptyState = { corrections: {}, weights: {} };

  try {
    const savedState = JSON.parse(localStorage.getItem(CLASSIFIER_STORAGE_KEY));
    if (!savedState || typeof savedState !== "object") {
      return emptyState;
    }

    return {
      corrections:
        savedState.corrections && typeof savedState.corrections === "object"
          ? savedState.corrections
          : {},
      weights:
        savedState.weights && typeof savedState.weights === "object"
          ? savedState.weights
          : {},
    };
  } catch {
    return emptyState;
  }
}

function saveClassifierState() {
  try {
    localStorage.setItem(CLASSIFIER_STORAGE_KEY, JSON.stringify(classifierState));
  } catch {
    // Classifier feedback remains available for the current page if storage is blocked.
  }
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleTokens(title) {
  return normalizeTitle(title)
    .split(" ")
    .filter(
      (token) => token.length > 2 && !CLASSIFIER_STOP_WORDS.has(token),
    );
}

function scoreTitle(title) {
  let score = 0;

  for (const cue of NEWS_CUES) {
    if (cue.pattern.test(title)) {
      score += cue.weight;
    }
  }

  for (const cue of BLOG_CUES) {
    if (cue.pattern.test(title)) {
      score -= cue.weight;
    }
  }

  for (const token of getTitleTokens(title)) {
    const learnedWeight = Number(classifierState.weights[token]);
    if (Number.isFinite(learnedWeight)) {
      score += learnedWeight;
    }
  }

  return score;
}

function classifyTitle(title) {
  const savedCorrection = classifierState.corrections[normalizeTitle(title)];
  if (CLASSIFIER_CATEGORIES.includes(savedCorrection)) {
    return savedCorrection;
  }

  return scoreTitle(title) > 0 ? CATEGORY_NEWS : CATEGORY_BLOG;
}

function categoryLabel(category) {
  return category === CATEGORY_NEWS
    ? "news/development"
    : "blog/advice/cool-stuff";
}

function categoryClass(category) {
  return category === CATEGORY_NEWS ? "is-news" : "is-blog";
}

function trainClassifier(title, category) {
  const titleKey = normalizeTitle(title);
  const target = category === CATEGORY_NEWS ? 1 : -1;
  classifierState.corrections[titleKey] = category;

  for (const token of getTitleTokens(title)) {
    const currentWeight = Number(classifierState.weights[token]) || 0;
    classifierState.weights[token] = Math.max(
      -4,
      Math.min(4, currentWeight + target),
    );
  }

  saveClassifierState();
}

function setSelectedFilter(category) {
  if (![CATEGORY_ALL, ...CLASSIFIER_CATEGORIES].includes(category)) {
    return;
  }

  selectedFilter = category;

  for (const button of filterBar.querySelectorAll("button[data-filter]")) {
    const isActive = button.dataset.filter === selectedFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  renderHeadlines(currentStories);
}

function renderHeadlines(items, { showEmpty = true } = {}) {
  headlinesList.textContent = "";

  const visibleItems = items.filter(
    (story) =>
      selectedFilter === CATEGORY_ALL || story.classification === selectedFilter,
  );

  if (!visibleItems.length && showEmpty) {
    const empty = document.createElement("li");
    empty.textContent = selectedFilter === CATEGORY_ALL
      ? "No stories found for that fixed 24-hour window."
      : "No stories match this filter.";
    headlinesList.appendChild(empty);
    return;
  }

  for (const story of visibleItems) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = story.title;
    li.appendChild(link);
    li.appendChild(document.createTextNode(" "));

    const label = document.createElement("span");
    label.className = `story-label ${categoryClass(story.classification)}`;
    label.textContent = categoryLabel(story.classification);
    li.appendChild(label);
    li.appendChild(document.createTextNode(" "));

    const source = document.createElement("span");
    source.className = "story-source";
    source.textContent = `(${story.source})`;
    source.title = `Article source: ${story.source}`;
    li.appendChild(source);
    li.appendChild(document.createTextNode(" "));

    const feedback = document.createElement("details");
    feedback.className = "story-feedback";

    const feedbackSummary = document.createElement("summary");
    feedbackSummary.textContent = "correct?";
    feedback.appendChild(feedbackSummary);

    const feedbackOptions = document.createElement("span");
    feedbackOptions.className = "feedback-options";

    for (const category of CLASSIFIER_CATEGORIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = category;
      button.dataset.storyId = String(story.id);
      button.textContent = categoryLabel(category);
      feedbackOptions.appendChild(button);
    }

    feedback.appendChild(feedbackOptions);
    li.appendChild(feedback);

    headlinesList.appendChild(li);
  }
}

function buildStoriesSearchUrl(dayStartUnix, dayEndUnix, page = 0) {
  const url = new URL(HN_SEARCH_URL);
  url.searchParams.set("tags", "story");
  url.searchParams.set(
    "numericFilters",
    `created_at_i>=${dayStartUnix},created_at_i<${dayEndUnix}`,
  );
  url.searchParams.set("hitsPerPage", String(SEARCH_PAGE_SIZE));
  url.searchParams.set("page", String(page));
  return url;
}

async function fetchStoriesPage(dayStartUnix, dayEndUnix, page = 0) {
  const response = await fetch(
    buildStoriesSearchUrl(dayStartUnix, dayEndUnix, page),
  );
  if (!response.ok) {
    throw new Error("Unable to fetch ranked stories");
  }
  return response.json();
}

function normalizeStory(hit) {
  const id = Number(hit.story_id ?? hit.objectID);

  if (!Number.isFinite(id) || typeof hit.title !== "string" || !hit.title) {
    return null;
  }

  const url = normalizeArticleUrl(hit.url);

  return {
    id,
    title: hit.title,
    url,
    source: getStorySource(url),
    classification: classifyTitle(hit.title),
    points: typeof hit.points === "number" ? hit.points : 0,
    createdAtUnix:
      typeof hit.created_at_i === "number" ? hit.created_at_i : 0,
  };
}

function compareStoriesByPoints(left, right) {
  if (right.points !== left.points) {
    return right.points - left.points;
  }

  return right.createdAtUnix - left.createdAtUnix;
}

async function fetchStoriesForDay(dayStartUnix, dayEndUnix) {
  const firstPage = await fetchStoriesPage(dayStartUnix, dayEndUnix, 0);
  const remainingPagePromises = [];

  for (let page = 1; page < firstPage.nbPages; page += 1) {
    remainingPagePromises.push(fetchStoriesPage(dayStartUnix, dayEndUnix, page));
  }

  const remainingPages = await Promise.all(remainingPagePromises);

  return [firstPage, ...remainingPages]
    .flatMap((page) => page.hits)
    .map(normalizeStory)
    .filter(Boolean);
}

async function fetchTopHeadlinesForDay(dateValue) {
  const nextDate = shiftIsoDate(dateValue, 1);
  const dayStartMs = zonedMidnightToUtcMs(dateValue, PACIFIC_TIME_ZONE);
  const dayEndMs = zonedMidnightToUtcMs(nextDate, PACIFIC_TIME_ZONE);

  const dayStartUnix = toUnixSeconds(dayStartMs);
  const dayEndUnix = toUnixSeconds(dayEndMs);
  currentStories = [];

  if (Date.now() < dayEndMs) {
    setStatus("day in progress", { inProgress: true });
    renderHeadlines([], { showEmpty: false });
    return;
  }

  setStatus("Loading ranked stories...");
  renderHeadlines([], { showEmpty: false });

  const stories = await fetchStoriesForDay(dayStartUnix, dayEndUnix);
  stories.sort(compareStoriesByPoints);
  currentStories = stories.slice(0, MAX_HEADLINES);

  setStatus("");
  renderHeadlines(currentStories);
}

function defaultDateValue() {
  const todayParts = getPacificDateParts();
  return shiftIsoDate(formatIsoDate(todayParts), -1);
}

dateNav.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-date]");
  if (!link) {
    return;
  }

  event.preventDefault();
  const nextDateValue = link.dataset.date;
  if (!nextDateValue || nextDateValue === selectedDateValue) {
    return;
  }

  selectedDateValue = nextDateValue;
  setActiveDateLink(selectedDateValue);

  try {
    await fetchTopHeadlinesForDay(selectedDateValue);
  } catch (error) {
    currentStories = [];
    setStatus(
      error instanceof Error ? error.message : "Failed to load headlines.",
    );
    renderHeadlines([]);
  }
});

filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) {
    return;
  }

  setSelectedFilter(button.dataset.filter);
});

headlinesList.addEventListener("click", (event) => {
  const button = event.target.closest(
    "button[data-category][data-story-id]",
  );
  if (!button) {
    return;
  }

  const story = currentStories.find(
    (candidate) => String(candidate.id) === button.dataset.storyId,
  );
  if (!story || !CLASSIFIER_CATEGORIES.includes(button.dataset.category)) {
    return;
  }

  trainClassifier(story.title, button.dataset.category);
  story.classification = button.dataset.category;
  renderHeadlines(currentStories);
});

const ptToday = formatIsoDate(getPacificDateParts());
buildDateLinks(shiftIsoDate(ptToday, -1));
setSelectedFilter(CATEGORY_ALL);

selectedDateValue = defaultDateValue();
setActiveDateLink(selectedDateValue);
updateSessionTimer();
setInterval(updateSessionTimer, 1000);
document.addEventListener("visibilitychange", updateSessionTimer);
fetchTopHeadlinesForDay(selectedDateValue).catch((error) => {
  setStatus(
    error instanceof Error ? error.message : "Failed to load headlines.",
  );
});
