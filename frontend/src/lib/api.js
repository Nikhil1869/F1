const BASE = '';

export async function fetchJSON(url, opts = {}) {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// Data APIs
export const getTeamPoints = () => fetchJSON('/api/data/team-points');
export const getTelemetry = (d1, d2) => fetchJSON(`/api/data/telemetry?d1=${d1}&d2=${d2}`);

// ML APIs
export const getUpcomingRaces = () => fetchJSON('/api/ml/upcoming_races');
export const predict = (eventName) => fetchJSON(`/api/ml/predict?event_name=${encodeURIComponent(eventName)}`);
export const predictAdvanced = () => fetchJSON('/api/ml/predict-advanced');
export const simulateSeason = () => fetchJSON('/api/ml/simulate-season');

// Chat API
export const sendChat = (message, context = {}) =>
  fetchJSON('/api/chat/', {
    method: 'POST',
    body: JSON.stringify({ message, context }),
  });

// Season API
export const getSeasonStandings = (year) => fetchJSON(`/api/season/standings?year=${year}`);

// Fantasy APIs
export const getFantasyDrivers = () => fetchJSON('/api/fantasy/drivers');
export const simulateFantasy = (drivers) =>
  fetchJSON('/api/fantasy/simulate', {
    method: 'POST',
    body: JSON.stringify({ drivers }),
  });

// Replay APIs
export const getReplaySessions = (year) => fetchJSON(`/api/replay/sessions?year=${year}`);
export const loadReplay = (year, round, session = 'R') =>
  fetchJSON(`/api/replay/load?year=${year}&round=${round}&session=${session}`);

// Auth APIs
export const login = (username, password) =>
  fetchJSON('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const register = (username, password) =>
  fetchJSON('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

// H2H APIs
export const getH2HDrivers = (year) => fetchJSON(`/api/h2h/drivers?year=${year}`);
export const compareH2H = (year, d1, d2) => fetchJSON(`/api/h2h/compare?year=${year}&d1=${d1}&d2=${d2}`);

// Laptimes APIs
export const getLaptimeRaces = (year) => fetchJSON(`/api/laptimes/races?year=${year}`);
export const analyzeLaptimes = (year, eventName) => fetchJSON(`/api/laptimes/analyze?year=${year}&event=${encodeURIComponent(eventName)}`);

// Calendar API
export const getCalendar = (year) => fetchJSON(`/api/calendar/schedule?year=${year}`);
