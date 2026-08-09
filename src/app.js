const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const MAX_HEADLINES = 15;
const SEARCH_PAGE_SIZE = 1000;
const DATE_LINK_DAYS = 3;
const PACIFIC_TIME_ZONE = "America/Los_Angeles";
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
const sessionStartedAt = Date.now();
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

function renderHeadlines(items, { showEmpty = true } = {}) {
  headlinesList.textContent = "";

  if (!items.length && showEmpty) {
    const empty = document.createElement("li");
    empty.textContent = "No stories found for that fixed 24-hour window.";
    headlinesList.appendChild(empty);
    return;
  }

  for (const story of items) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = story.title;
    li.appendChild(link);
    li.appendChild(document.createTextNode(" "));

    const source = document.createElement("span");
    source.className = "story-source";
    source.textContent = `(${story.source})`;
    source.title = `Article source: ${story.source}`;
    li.appendChild(source);
    li.appendChild(document.createTextNode(" "));

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

  if (Date.now() < dayEndMs) {
    setStatus("day in progress", { inProgress: true });
    renderHeadlines([], { showEmpty: false });
    return;
  }

  setStatus("Loading ranked stories...");
  renderHeadlines([], { showEmpty: false });

  const stories = await fetchStoriesForDay(dayStartUnix, dayEndUnix);
  stories.sort(compareStoriesByPoints);

  setStatus("");
  renderHeadlines(stories.slice(0, MAX_HEADLINES));
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
    setStatus(
      error instanceof Error ? error.message : "Failed to load headlines.",
    );
    renderHeadlines([]);
  }
});

const ptToday = formatIsoDate(getPacificDateParts());
buildDateLinks(shiftIsoDate(ptToday, -1));

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
