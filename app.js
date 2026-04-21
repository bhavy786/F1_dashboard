const VIEWBOX = { width: 1000, height: 720, padding: 70 };

const elements = {
  greeting: document.querySelector("#greeting"),
  dateline: document.querySelector("#dateline"),
  tickerTrack: document.querySelector("#ticker-track"),
  heroSummary: document.querySelector("#hero-summary"),
  modeBadge: document.querySelector("#mode-badge"),
  lastUpdated: document.querySelector("#last-updated"),
  focusRound: document.querySelector("#focus-round"),
  focusFlag: document.querySelector("#focus-flag"),
  focusTitle: document.querySelector("#focus-title"),
  focusCircuit: document.querySelector("#focus-circuit"),
  focusLocation: document.querySelector("#focus-location"),
  focusSummary: document.querySelector("#focus-summary"),
  focusStatus: document.querySelector("#focus-status"),
  focusCountry: document.querySelector("#focus-country"),
  focusFeed: document.querySelector("#focus-feed"),
  nextRaceName: document.querySelector("#next-race-name"),
  nextRaceDetail: document.querySelector("#next-race-detail"),
  countdownDays: document.querySelector("#countdown-days"),
  countdownHours: document.querySelector("#countdown-hours"),
  countdownMinutes: document.querySelector("#countdown-minutes"),
  countdownSeconds: document.querySelector("#countdown-seconds"),
  calendarMeta: document.querySelector("#calendar-meta"),
  calendarList: document.querySelector("#calendar-list"),
  calProgressFill: document.querySelector("#cal-progress-fill"),
  driversSub: document.querySelector("#drivers-sub"),
  driversList: document.querySelector("#drivers-list"),
  teamsList: document.querySelector("#teams-list"),
  podiumHead: document.querySelector("#podium-head"),
  podiumList: document.querySelector("#podium-list"),
  intelList: document.querySelector("#intel-list"),
  statLeader: document.querySelector("#stat-leader"),
  statLeaderSub: document.querySelector("#stat-leader-sub"),
  statTeam: document.querySelector("#stat-team"),
  statTeamSub: document.querySelector("#stat-team-sub"),
  statNext: document.querySelector("#stat-next"),
  statNextSub: document.querySelector("#stat-next-sub"),
  statLive: document.querySelector("#stat-live"),
  statLiveSub: document.querySelector("#stat-live-sub"),
  liveSessionSummary: document.querySelector("#live-session-summary"),
  liveSessionStatus: document.querySelector("#live-session-status"),
  liveSessionLabel: document.querySelector("#live-session-label"),
  liveTrackTitle: document.querySelector("#live-track-title"),
  liveTrackMode: document.querySelector("#live-track-mode"),
  liveTrackMap: document.querySelector("#live-track-map"),
  liveTrackOverlay: document.querySelector("#live-track-overlay"),
  liveTrackNote: document.querySelector("#live-track-note"),
  liveTrackLegend: document.querySelector("#live-track-legend"),
  liveOrderTitle: document.querySelector("#live-order-title"),
  liveOrderRows: document.querySelector("#live-order-rows"),
};

const state = {
  countdownTimer: null,
  refreshTimer: null,
  calendarAutoFocused: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getFlagEmoji(code) {
  if (!code) {
    return "F1";
  }

  const normalized = String(code).trim().toUpperCase();
  return normalized;
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatShortDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function initializeClock() {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  elements.greeting.textContent = `${greeting}, Bhavy`;
  elements.dateline.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);
}

function startCountdown(startIso) {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
  }

  const update = () => {
    if (!startIso) {
      elements.countdownDays.textContent = "00";
      elements.countdownHours.textContent = "00";
      elements.countdownMinutes.textContent = "00";
      elements.countdownSeconds.textContent = "00";
      return;
    }

    const diff = Math.max(0, new Date(startIso).getTime() - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    elements.countdownDays.textContent = pad(days);
    elements.countdownHours.textContent = pad(hours);
    elements.countdownMinutes.textContent = pad(minutes);
    elements.countdownSeconds.textContent = pad(seconds);
  };

  update();
  state.countdownTimer = window.setInterval(update, 1000);
}

function renderTicker(payload) {
  const driverLeader = payload.championship.drivers?.[0];
  const teamLeader = payload.championship.teams?.[0];
  const items = [
    {
      sym: "MODE",
      val: payload.meta.modeLabel,
      pts: payload.focus.status,
    },
    {
      sym: "FOCUS",
      val: payload.focus.meetingName,
      pts: payload.focus.circuit,
    },
    {
      sym: "WDC",
      val: driverLeader?.acronym || driverLeader?.driver || "--",
      pts: `${driverLeader?.points ?? "--"} pts`,
    },
    {
      sym: "WCC",
      val: teamLeader?.team || "--",
      pts: `${teamLeader?.points ?? "--"} pts`,
    },
    {
      sym: "NEXT",
      val: payload.nextRace.meetingName,
      pts: payload.nextRace.startIso ? formatShortDate(payload.nextRace.startIso) : "TBC",
    },
    {
      sym: "LIVE",
      val: payload.liveSession.active ? payload.liveSession.circuit : "NO RACE TODAY",
      pts: payload.liveSession.active ? payload.liveSession.status : "Stand by",
    },
  ];

  const markup = items
    .map(
      (item) => `
        <span class="tick">
          <span class="sym">${escapeHtml(item.sym)}</span>
          <span class="val">${escapeHtml(item.val)}</span>
          <span class="pts">${escapeHtml(item.pts)}</span>
        </span>
        <span class="tick tick-dot">|</span>
      `,
    )
    .join("");

  elements.tickerTrack.innerHTML = markup + markup;
}

function renderCalendar(payload) {
  const calendar = payload.calendar || [];

  elements.calendarMeta.textContent = `${payload.season.completedRaces}/${payload.season.totalRaces} rounds completed`;

  if (!calendar.length) {
    elements.calendarList.innerHTML = `
      <article class="cal-round loading">
        <p>Could not load the season calendar.</p>
      </article>
    `;
    elements.calProgressFill.style.transform = "scaleX(0)";
    return;
  }

  const progress = payload.season.totalRaces
    ? payload.season.completedRaces / payload.season.totalRaces
    : 0;
  elements.calProgressFill.style.transform = `scaleX(${progress})`;

  elements.calendarList.innerHTML = calendar
    .map((race) => {
      const stateClass = race.isActive ? "live" : race.isNext ? "next" : race.isCompleted ? "done" : "";
      const flag = getFlagEmoji(race.countryCode);
      return `
        <article class="cal-round ${stateClass}">
          <div class="cal-rnum">R${escapeHtml(race.round)}<span class="cal-status-dot"></span></div>
          <div class="cal-flag-emoji">${escapeHtml(flag)}</div>
          <div class="cal-country">${escapeHtml(race.country)}</div>
          <div class="cal-flag-name">${escapeHtml(race.circuit)}</div>
          <div class="cal-date">${escapeHtml(formatDateTime(race.startIso))}</div>
        </article>
      `;
    })
    .join("");

  const target = elements.calendarList.querySelector(".live, .next");
  if (target && !state.calendarAutoFocused) {
    target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    state.calendarAutoFocused = true;
  }
}

function renderDrivers(payload) {
  const rows = (payload.championship.drivers || []).slice(0, 10);
  const leaderPoints = rows[0]?.points ?? 0;

  elements.driversSub.textContent = `Top 10 / After ${payload.season.completedRaces} rounds`;

  if (!rows.length) {
    elements.driversList.innerHTML = `
      <div class="driver-row">
        <div class="driver-info">
          <div class="driver-name">Championship data unavailable</div>
        </div>
      </div>
    `;
    return;
  }

  elements.driversList.innerHTML = rows
    .map((row, index) => {
      const gap = index === 0 ? "Leader" : `+${leaderPoints - row.points}`;
      return `
        <div class="driver-row ${index === 0 ? "leader" : ""}" style="--team-color:#${escapeHtml(row.teamColor)};animation-delay:${(4.4 + index * 0.08).toFixed(2)}s;">
          <div class="driver-pos">${escapeHtml(pad(row.position))}</div>
          <div class="driver-info">
            <div class="driver-line">
              <span class="driver-name">${escapeHtml(row.driver)}</span>
              <span class="driver-code">${escapeHtml(row.acronym || "--")}</span>
            </div>
            <div class="driver-team">${escapeHtml(row.team)} / <span class="gap">${escapeHtml(gap)}</span></div>
          </div>
          <div class="driver-pts-wrap">
            <div class="driver-pts">${escapeHtml(row.points)}</div>
            <div class="driver-pts-sub">pts</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTeams(payload) {
  const rows = payload.championship.teams || [];
  const maxPoints = rows[0]?.points || 1;

  if (!rows.length) {
    elements.teamsList.innerHTML = `
      <div class="con-row">
        <div class="con-name">Constructor data unavailable</div>
      </div>
    `;
    return;
  }

  elements.teamsList.innerHTML = rows
    .map(
      (row, index) => `
        <div class="con-row" style="--team-color:#${escapeHtml(row.teamColor)};animation-delay:${(4.4 + index * 0.08).toFixed(2)}s;">
          <div class="con-top">
            <div class="con-pos">${escapeHtml(pad(row.position))}</div>
            <div class="con-body">
              <div class="con-name">${escapeHtml(row.team)}</div>
              <div class="con-engine">Team position / Official results</div>
            </div>
            <div class="con-pts">${escapeHtml(row.points)}</div>
          </div>
          <div class="con-bar">
            <div class="con-bar-fill" style="width:${(row.points / maxPoints) * 100}%"></div>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderPodium(payload) {
  const rows = payload.focus.topThree || [];
  elements.podiumHead.textContent = `${payload.focus.meetingName} / ${payload.focus.circuit}`;

  if (!rows.length) {
    elements.podiumList.innerHTML = `
      <div class="pod-row">
        <div class="pod-badge">--</div>
        <div>
          <div class="pod-driver-name">No race podium yet</div>
          <div class="pod-driver-team">Waiting for classified results</div>
        </div>
        <div class="pod-time">Stand by</div>
      </div>
    `;
    return;
  }

  elements.podiumList.innerHTML = rows
    .slice(0, 3)
    .map((row, index) => {
      const rank = index + 1;
      const driverName = row.fullName || row.driver || "--";
      const teamName = row.teamName || row.team || "--";
      const label =
        row.gap || (row.points !== undefined ? `${row.points} pts` : rank === 1 ? "Winner" : "--");

      return `
        <div class="pod-row p${rank}">
          <div class="pod-badge">P${rank}</div>
          <div>
            <div class="pod-driver-name">${escapeHtml(driverName)}</div>
            <div class="pod-driver-team">${escapeHtml(teamName)} / ${escapeHtml(row.acronym || "--")}</div>
          </div>
          <div class="pod-time">${escapeHtml(label)}</div>
        </div>
      `;
    })
    .join("");
}

function renderIntel(payload) {
  const nextRaceLine = payload.nextRace.startIso
    ? `${payload.nextRace.meetingName} starts ${formatDateTime(payload.nextRace.startIso)} in ${payload.nextRace.location}.`
    : "No upcoming race is currently available from the schedule feed.";

  const items = [
    {
      kicker: "The Story",
      num: "01",
      headline: payload.focus.meetingName,
      body: payload.focus.summary,
    },
    {
      kicker: "Next Stop",
      num: "02",
      headline: payload.nextRace.meetingName || "Season complete",
      body: nextRaceLine,
    },
    {
      kicker: "Live Watch",
      num: "03",
      headline: payload.liveSession.active ? payload.liveSession.meetingName : "No race today",
      body: payload.liveSession.summary,
    },
    {
      kicker: "Feed Stack",
      num: "04",
      headline: "Live timing + official standings",
      body: "Race-day timing comes from livef1, while season driver and team positions are taken from official Formula 1 results pages.",
    },
  ];

  elements.intelList.innerHTML = items
    .map(
      (item) => `
        <article class="news-item">
          <div class="news-meta">
            <span class="news-kicker">${escapeHtml(item.kicker)}</span>
            <span class="news-num">${escapeHtml(item.num)}</span>
          </div>
          <h3 class="news-headline">${escapeHtml(item.headline)}</h3>
          <p class="news-body">${escapeHtml(item.body)}</p>
        </article>
      `,
    )
    .join("");
}

function renderStats(payload) {
  const driverLeader = payload.championship.drivers?.[0];
  const teamLeader = payload.championship.teams?.[0];

  elements.statLeader.textContent = driverLeader?.acronym || "--";
  elements.statLeaderSub.textContent = driverLeader
    ? `${driverLeader.driver} / ${driverLeader.points} pts`
    : "No driver standings";

  elements.statTeam.textContent = teamLeader?.team || "--";
  elements.statTeamSub.textContent = teamLeader
    ? `${teamLeader.points} pts / P${teamLeader.position}`
    : "No constructor standings";

  elements.statNext.textContent = payload.nextRace.round
    ? `R${payload.nextRace.round}`
    : "--";
  elements.statNextSub.textContent = payload.nextRace.startIso
    ? `${payload.nextRace.meetingName} / ${formatShortDate(payload.nextRace.startIso)}`
    : "No next race scheduled";

  elements.statLive.textContent = payload.liveSession.active ? "LIVE" : "OFF";
  elements.statLiveSub.textContent = payload.liveSession.active
    ? `${payload.liveSession.circuit} / ${payload.liveSession.status}`
    : "No race today";
}

function renderLiveOrder(rows) {
  if (!rows.length) {
    elements.liveOrderRows.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">No race today.</td>
      </tr>
    `;
    return;
  }

  elements.liveOrderRows.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td><span class="pos-pill">${escapeHtml(row.position ?? "--")}</span></td>
          <td>
            <div class="driver-chip">
              <span class="dot" style="background:#${escapeHtml(row.teamColor)}"></span>
              <div class="driver-chip__text">
                <strong>${escapeHtml(row.acronym || "--")}</strong>
                <small>${escapeHtml(row.fullName || "--")}</small>
              </div>
            </div>
          </td>
          <td>${escapeHtml(row.gap || "--")}</td>
          <td>${escapeHtml(row.lastLap || "--")}</td>
          <td><span class="status-tag">${escapeHtml(row.statusText || "--")}</span></td>
        </tr>
      `,
    )
    .join("");
}

function normalizeTrack(pathPoints = [], dots = []) {
  const points = [...pathPoints, ...dots].filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );

  if (!points.length) {
    return {
      path: "",
      transform: () => ({ x: 0, y: 0 }),
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min(
    (VIEWBOX.width - VIEWBOX.padding * 2) / width,
    (VIEWBOX.height - VIEWBOX.padding * 2) / height,
  );

  const transform = (point) => ({
    x: VIEWBOX.padding + (point.x - minX) * scale,
    y: VIEWBOX.height - VIEWBOX.padding - (point.y - minY) * scale,
  });

  const path = pathPoints
    .map((point, index) => {
      const transformed = transform(point);
      return `${index === 0 ? "M" : "L"} ${transformed.x.toFixed(2)} ${transformed.y.toFixed(2)}`;
    })
    .join(" ");

  return { path, transform };
}

function renderTrack(track, title, overlayMessage) {
  elements.liveTrackTitle.textContent = title;
  elements.liveTrackMode.textContent = track.modeLabel || "Stand by";
  elements.liveTrackNote.textContent = track.note || overlayMessage;

  const { path, transform } = normalizeTrack(track.pathPoints, track.dots);

  if (!path) {
    elements.liveTrackMap.innerHTML = "";
    elements.liveTrackOverlay.hidden = false;
    elements.liveTrackOverlay.innerHTML = `<p>${escapeHtml(overlayMessage)}</p>`;
    elements.liveTrackLegend.innerHTML = "";
    return;
  }

  const dots = (track.dots || [])
    .map((dot) => {
      const point = transform(dot);
      return `
        <g>
          <circle class="driver-ring" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="15"></circle>
          <circle class="driver-dot" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="11" fill="#${escapeHtml(dot.teamColor)}"></circle>
          <text class="driver-label" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}">${escapeHtml(dot.acronym)}</text>
        </g>
      `;
    })
    .join("");

  elements.liveTrackMap.innerHTML = `
    <path class="track-outline-shadow" d="${path}"></path>
    <path class="track-outline-main" d="${path}"></path>
    <path class="track-outline-glow" d="${path}"></path>
    ${dots}
  `;
  elements.liveTrackOverlay.hidden = true;

  elements.liveTrackLegend.innerHTML = (track.dots || [])
    .slice(0, 12)
    .map(
      (dot) => `
        <span class="legend-chip">
          <span class="legend-dot" style="background:#${escapeHtml(dot.teamColor)}"></span>
          ${escapeHtml(`P${dot.position} ${dot.acronym}`)}
        </span>
      `,
    )
    .join("");
}

function renderLiveSession(payload) {
  const session = payload.liveSession;

  elements.liveSessionSummary.textContent = session.summary;
  elements.liveSessionStatus.textContent = session.active ? "Live session" : "No race today";
  elements.liveSessionLabel.textContent = session.active
    ? `${session.meetingName} / ${session.circuit}`
    : "Live positions return on race day";
  elements.liveOrderTitle.textContent = session.active ? session.title : "No race today";

  if (!session.active) {
    renderTrack(
      session.track,
      "Live track",
      "No race today. Live race dots and on-track positions appear automatically once the race session is active.",
    );
    renderLiveOrder([]);
    return;
  }

  renderTrack(
    session.track,
    `${session.meetingName} / ${session.circuit}`,
    "Waiting for live track coordinates from the current session.",
  );
  renderLiveOrder(session.raceOrder || []);
}

function render(payload) {
  initializeClock();
  renderTicker(payload);

  elements.heroSummary.textContent = payload.focus.summary;
  elements.modeBadge.textContent = payload.meta.modeLabel;
  elements.lastUpdated.textContent = `Synced ${formatTime(payload.meta.updatedAt)}`;

  elements.focusRound.textContent = payload.focus.round ? `Round ${payload.focus.round}` : "Round --";
  elements.focusFlag.textContent = getFlagEmoji(payload.focus.countryCode || payload.nextRace.countryCode);
  elements.focusTitle.textContent = payload.focus.meetingName;
  elements.focusCircuit.textContent = payload.focus.circuit;
  elements.focusLocation.textContent = payload.focus.location;
  elements.focusSummary.textContent = payload.focus.summary;
  elements.focusStatus.textContent = payload.focus.status;
  elements.focusCountry.textContent = payload.focus.country;
  elements.focusFeed.textContent = payload.meta.feed;

  elements.nextRaceName.textContent = payload.nextRace.meetingName || "Season complete";
  elements.nextRaceDetail.textContent = payload.nextRace.startIso
    ? `${formatDateTime(payload.nextRace.startIso)} / ${payload.nextRace.location}`
    : "No upcoming race returned by the current schedule.";

  renderCalendar(payload);
  renderDrivers(payload);
  renderTeams(payload);
  renderPodium(payload);
  renderIntel(payload);
  renderStats(payload);
  renderLiveSession(payload);
  startCountdown(payload.nextRace.startIso || null);
}

function scheduleRefresh(ms) {
  if (state.refreshTimer) {
    window.clearTimeout(state.refreshTimer);
  }
  state.refreshTimer = window.setTimeout(loadDashboard, ms);
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/dashboard", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Dashboard request failed");
    }

    render(payload);
    scheduleRefresh(payload.meta.refreshMs || 30000);
  } catch (error) {
    initializeClock();
    elements.heroSummary.textContent = "The backend could not be reached just now.";
    elements.modeBadge.textContent = "Feed error";
    elements.lastUpdated.textContent = error.message;
    elements.focusTitle.textContent = "Could not load Bhavy's Pit Wall";
    elements.focusSummary.textContent = error.message;
    elements.liveSessionSummary.textContent = error.message;
    elements.liveSessionStatus.textContent = "Offline";
    elements.liveSessionLabel.textContent = "Backend unavailable";
    renderTrack(
      {
        modeLabel: "Offline",
        note: error.message,
        pathPoints: [],
        dots: [],
      },
      "Live track",
      error.message,
    );
    renderLiveOrder([]);
    scheduleRefresh(30000);
  }
}

initializeClock();
loadDashboard();
