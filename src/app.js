const API_BASE = "https://hacker-news.firebaseio.com/v0";
const TOP_STORIES_URL = `${API_BASE}/topstories.json`;
const ITEM_URL = (id) => `${API_BASE}/item/${id}.json`;
const MAX_HEADLINES = 10;
const BATCH_SIZE = 25;
const DATE_LINK_DAYS = 7;
const EASTERN_TIME_ZONE = "America/New_York";
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
const windowLabel = document.getElementById("windowLabel");
const statusText = document.getElementById("status");
const headlinesList = document.getElementById("headlines");
let selectedDateValue = "";

function parseIsoDate(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return { year, month, day };
}

function formatIsoDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getEasternDateParts(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TIME_ZONE,
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

function formatEtDayLabel(milliseconds) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(milliseconds));
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

function renderHeadlines(items, { showEmpty = true } = {}) {
  headlinesList.textContent = "";

  if (!items.length && showEmpty) {
    const empty = document.createElement("li");
    empty.textContent =
      "No qualifying stories found for that fixed 24-hour window.";
    headlinesList.appendChild(empty);
    return;
  }

  for (const story of items) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `https://news.ycombinator.com/item?id=${story.id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = story.title;
    li.appendChild(link);
    headlinesList.appendChild(li);
  }
}

async function fetchItem(id) {
  const response = await fetch(ITEM_URL(id));
  if (!response.ok) {
    throw new Error(`Unable to fetch story ${id}`);
  }
  return response.json();
}

function isQualifyingStory(item, dayStartUnix, dayEndUnix) {
  if (!item) {
    return false;
  }

  return (
    item.type === "story" &&
    !item.deleted &&
    !item.dead &&
    typeof item.time === "number" &&
    typeof item.title === "string" &&
    item.time >= dayStartUnix &&
    item.time < dayEndUnix
  );
}

async function fetchTopHeadlinesForDay(dateValue) {
  const nextDate = shiftIsoDate(dateValue, 1);
  const dayStartMs = zonedMidnightToUtcMs(dateValue, EASTERN_TIME_ZONE);
  const dayEndMs = zonedMidnightToUtcMs(nextDate, EASTERN_TIME_ZONE);

  const dayStartUnix = toUnixSeconds(dayStartMs);
  const dayEndUnix = toUnixSeconds(dayEndMs);

  const dayLabel = formatEtDayLabel(dayStartMs);
  windowLabel.textContent = `Top 10 for ${dayLabel} (ET)`;
  statusText.textContent = "Loading headlines...";
  renderHeadlines([], { showEmpty: false });

  const idsResponse = await fetch(TOP_STORIES_URL);
  if (!idsResponse.ok) {
    throw new Error("Unable to fetch top story IDs");
  }

  const topStoryIds = await idsResponse.json();
  const collected = [];

  for (let index = 0; index < topStoryIds.length; index += BATCH_SIZE) {
    const batchIds = topStoryIds.slice(index, index + BATCH_SIZE);
    const batchItems = await Promise.all(
      batchIds.map((id) => fetchItem(id).catch(() => null)),
    );

    for (const item of batchItems) {
      if (isQualifyingStory(item, dayStartUnix, dayEndUnix)) {
        collected.push(item);
        if (collected.length === MAX_HEADLINES) {
          break;
        }
      }
    }

    if (collected.length === MAX_HEADLINES) {
      break;
    }
  }

  statusText.textContent = "";
  renderHeadlines(collected);
}

function defaultDateValue() {
  const todayParts = getEasternDateParts();
  return formatIsoDate(todayParts);
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
    statusText.textContent =
      error instanceof Error ? error.message : "Failed to load headlines.";
    renderHeadlines([]);
  }
});

const etToday = formatIsoDate(getEasternDateParts());
buildDateLinks(etToday);

selectedDateValue = defaultDateValue();
setActiveDateLink(selectedDateValue);
fetchTopHeadlinesForDay(selectedDateValue).catch((error) => {
  statusText.textContent =
    error instanceof Error ? error.message : "Failed to load headlines.";
});
