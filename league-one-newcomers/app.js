(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LeagueOneNewcomers = api;
  if (root.document && root.addEventListener) {
    root.addEventListener('DOMContentLoaded', api.init, {once: true});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DATA_URL = './data/newcomers.json';
  const REFRESH_CONFIG_URL = './data/refresh-config.json';
  const REFRESH_STATUS_URL = './data/refresh-status.json';
  const REFRESH_PATH = '/api/newcomers/refresh';
  const RUN_STATUS_PATH = '/api/newcomers/refresh/status';
  const GATEWAY_ORIGIN = 'https://weekly-shots-refresh.alllots1324.workers.dev';
  const WORKFLOW_URL = 'https://github.com/embcars2025/soccer-sports-bet/actions/workflows/refresh-newcomers.yml';
  const EXPECTED_TEAM_COUNT = 11;
  const PENDING_STORAGE_KEY = 'league-one-newcomers-pending-refresh';

  let currentData = null;
  let publicRefreshStatus = null;
  let refreshConfig = null;
  let refreshBusy = false;
  let elements = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character];
    });
  }

  function normalized(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' y ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function finite(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function displayNumber(value, digits) {
    const parsed = finite(value);
    return parsed == null ? '—' : parsed.toFixed(digits == null ? 1 : digits);
  }

  function formatDateTime(value, locale) {
    if (!value) return 'not available';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale || 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short'
    }).format(parsed);
  }

  function pickDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York'
    }).formatToParts(parsed);
    const get = function (type) {
      const match = parts.find(function (part) { return part.type === type; });
      return match ? match.value : '';
    };
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  function pickDateLabel(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value || 'Unknown date');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York'
    }).format(parsed);
  }

  function validateData(data) {
    if (!data || typeof data !== 'object') throw new Error('the response was not a JSON object');
    if (data.mode !== 'T1_ONLY') throw new Error('the dataset is not marked T1_ONLY');
    if (!Array.isArray(data.promoted_teams)) throw new Error('promoted_teams is missing');
    if (!Array.isArray(data.fixtures)) throw new Error('fixtures is missing');
    return data;
  }

  function playerTeamRows(data) {
    if (!data || !data.player_stats || !Array.isArray(data.player_stats.teams)) return [];
    return data.player_stats.teams.filter(function (team) {
      return team && typeof team.team === 'string' && Array.isArray(team.players);
    });
  }

  function topPlayers(players, metric) {
    return (Array.isArray(players) ? players : [])
      .filter(function (player) {
        return player && typeof player.player === 'string' && finite(player[metric]) != null;
      })
      .slice()
      .sort(function (left, right) {
        const difference = Number(right[metric]) - Number(left[metric]);
        return difference || left.player.localeCompare(right.player, 'es', {sensitivity: 'base'});
      })
      .slice(0, 3)
      .map(function (player) {
        return {player: player.player, value: Number(player[metric])};
      });
  }

  function answerPlayerQuery(data, question) {
    const query = normalized(question);
    const teams = playerTeamRows(data);
    const playerTerms = /\b(jugador|jugadores|tirador|tiradores|rematador|rematadores|tiro|tiros|disparo|disparos|player|players|shooter|shooters|shot|shots|sot)\b/;
    if (!query || !playerTerms.test(query)) {
      return {
        ok: false,
        message: 'Pregunta por los 3 mejores tiradores, los 3 mejores en tiros a puerta o ambas listas.'
      };
    }
    if (!teams.length) {
      return {
        ok: false,
        message: 'Los totales de jugadores de la temporada actual todavía no están disponibles en los datos publicados.'
      };
    }

    const wantsSot = /tiros? (?:a|al) (?:puerta|porteria|arco)|entre los tres palos|(?:shots?|shooters?) on target|\bsot\b/.test(query);
    const wantsBoth = wantsSot && (
      /tiradores?.*(?: y | ademas ).*(?:puerta|porteria|arco)/.test(query) ||
      /(?:tiros?|shots?).*(?: y | ademas ).*(?:tiros? (?:a|al) (?:puerta|porteria|arco)|shots? on target|sot)/.test(query) ||
      /shooters?.* and .*shooters? on target/.test(query) ||
      /ambas|ambos|las dos listas|each metric/.test(query)
    );
    const metrics = wantsBoth ? ['shots', 'sot'] : (wantsSot ? ['sot'] : ['shots']);
    const namedTeams = teams.filter(function (team) {
      return query.includes(normalized(team.team));
    });
    const selectedTeams = namedTeams.length ? namedTeams : teams;
    const season = data && data.player_stats && (data.player_stats.season || data.season_label);

    return {
      ok: true,
      season: season || 'temporada actual',
      scope: data.player_stats.scope || '',
      metrics: metrics,
      teams: selectedTeams.map(function (team) {
        return {
          team: team.team,
          matches_counted: team.matches_counted,
          shots: metrics.includes('shots') ? topPlayers(team.players, 'shots') : [],
          sot: metrics.includes('sot') ? topPlayers(team.players, 'sot') : []
        };
      })
    };
  }

  function leadersList(rows) {
    if (!rows.length) return 'Sin datos publicados';
    return rows.map(function (row, index) {
      return (index + 1) + '. ' + escapeHtml(row.player) + ' (' + displayNumber(row.value, 0) + ')';
    }).join(', ');
  }

  function renderPlayerAnswer(answer) {
    if (!answer.ok) return '<p>' + escapeHtml(answer.message) + '</p>';
    const cards = answer.teams.map(function (team) {
      const metricRows = [];
      if (answer.metrics.includes('shots')) {
        metricRows.push('<p><strong>Tiros:</strong> ' + leadersList(team.shots) + '</p>');
      }
      if (answer.metrics.includes('sot')) {
        metricRows.push('<p><strong>Tiros a puerta:</strong> ' + leadersList(team.sot) + '</p>');
      }
      const sample = finite(team.matches_counted) == null ? '' :
        '<span class="sample-label">' + displayNumber(team.matches_counted, 0) + ' partidos contabilizados</span>';
      return '<section class="leader-team"><h3>' + escapeHtml(team.team) + '</h3>' + sample + metricRows.join('') + '</section>';
    }).join('');
    const scope = answer.scope ? '<p>' + escapeHtml(answer.scope) + '</p>' : '';
    return '<p><strong>Líderes de ' + escapeHtml(answer.season) + '.</strong> Los empates se ordenan por nombre.</p>' +
      scope + '<div class="leader-grid">' + cards + '</div>';
  }

  function averagesFor(fixture, side) {
    const component = fixture && fixture[side + '_components'];
    if (component && component.current_form && typeof component.current_form === 'object') return component.current_form;
    const averages = fixture && fixture[side + '_averages'];
    return averages && typeof averages === 'object' ? averages : {};
  }

  function isNewcomer(fixture, name) {
    return Array.isArray(fixture.newcomer_teams) && fixture.newcomer_teams.some(function (team) {
      if (typeof team === 'string') return normalized(team) === normalized(name);
      return team && normalized(team.team || team.name) === normalized(name);
    });
  }

  function formTable(rows, team) {
    if (!Array.isArray(rows) || !rows.length) {
      return '<p class="no-form">Current top-flight form is not available yet.</p>';
    }
    return '<div class="table-wrap"><table><caption class="visually-hidden">Current top-flight form for ' +
      escapeHtml(team) + '</caption><thead><tr><th scope="col">Date</th><th scope="col">V</th>' +
      '<th scope="col">Opponent</th><th scope="col">Score</th><th scope="col">T</th>' +
      '<th scope="col">TA</th><th scope="col">TR</th><th scope="col">TAR</th><th scope="col">RC</th>' +
      '</tr></thead><tbody>' + rows.map(function (row) {
        const redCardNames = (Array.isArray(row.red_card_players) ? row.red_card_players : [])
          .map(function (item) { return item && item.player; }).filter(Boolean).join(', ');
        return '<tr><td>' + escapeHtml(row.date || '—') + '</td><td>' + escapeHtml(row.venue || '—') +
          '</td><td class="opponent">' + escapeHtml(row.opponent || '—') + '</td><td>' +
          escapeHtml(row.score || '—') + '</td><td>' + displayNumber(row.T, 0) + '</td><td>' +
          displayNumber(row.TA, 0) + '</td><td>' + displayNumber(row.TR, 0) + '</td><td>' +
          displayNumber(row.TAR, 0) + '</td><td title="' + escapeHtml(redCardNames) + '">' +
          (row.red_card ? 'YES' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function formPanel(fixture, side) {
    const team = fixture[side + '_team'] || 'Unknown team';
    const rows = Array.isArray(fixture[side + '_form']) ? fixture[side + '_form'] : [];
    const averages = averagesFor(fixture, side);
    const newcomerLabel = isNewcomer(fixture, team) ? ' · NEWCOMER' : '';
    return '<section class="form-panel"><header><strong>' + escapeHtml(team) + '</strong><span>' +
      side.toUpperCase() + newcomerLabel + '</span></header>' + formTable(rows, team) +
      '<p class="form-summary"><span>Sample <strong>' + rows.length + '</strong></span>' +
      '<span>T <strong>' + displayNumber(averages.T) + '</strong></span>' +
      '<span>TA <strong>' + displayNumber(averages.TA) + '</strong></span>' +
      '<span>Received context: TR <strong>' + displayNumber(averages.TR) + '</strong> · TAR <strong>' +
      displayNumber(averages.TAR) + '</strong></span></p></section>';
  }

  function forecastValue(fixture, key) {
    return fixture && fixture.forecasts ? fixture.forecasts[key] : null;
  }

  function componentValue(fixture, key) {
    return fixture && fixture.components ? fixture.components[key] : null;
  }

  function forecastBox(label, value) {
    return '<div class="forecast-box"><span>' + escapeHtml(label) + '</span><strong>' +
      displayNumber(value) + '</strong></div>';
  }

  function forecastSection(fixture) {
    const home = fixture.home_team || 'Home';
    const away = fixture.away_team || 'Away';
    return '<div class="forecast-section"><section class="available-components">' +
      '<h4 class="component-heading">AVAILABLE · T1 / TA1 CURRENT-FORM FORECAST</h4>' +
      '<div class="forecast-boxes">' +
      forecastBox(home + ' shots', forecastValue(fixture, 'home_shots')) +
      forecastBox(away + ' shots', forecastValue(fixture, 'away_shots')) +
      forecastBox('T1 combined shots', componentValue(fixture, 'T1')) +
      forecastBox(home + ' SOT', forecastValue(fixture, 'home_sot')) +
      forecastBox(away + ' SOT', forecastValue(fixture, 'away_sot')) +
      forecastBox('TA1 combined SOT', componentValue(fixture, 'TA1')) +
      '</div></section><section class="unavailable-components">' +
      '<h4 class="component-heading">UNAVAILABLE · PRIOR H2H COMPONENTS</h4>' +
      '<div class="unavailable-grid">' +
      '<div class="unavailable-box"><strong>T2 — N/A</strong>Same-venue H2H</div>' +
      '<div class="unavailable-box"><strong>T3 — N/A</strong>Two-H2H average</div>' +
      '<div class="unavailable-box"><strong>TA2 — N/A</strong>Same-venue H2H</div>' +
      '<div class="unavailable-box"><strong>TA3 — N/A</strong>Two-H2H average</div>' +
      '</div><p class="unavailable-note">No three-part average is calculated. Do not compare T1 / TA1 directly with the full-baseline forecast.</p>' +
      '</section></div>';
  }

  function fixtureReady(fixture) {
    return fixture && fixture.status === 'ready' && finite(forecastValue(fixture, 'home_shots')) != null &&
      finite(forecastValue(fixture, 'away_shots')) != null && finite(componentValue(fixture, 'T1')) != null;
  }

  function worksheet(fixture) {
    const ready = fixtureReady(fixture);
    const matchId = fixture.match_id == null ? '' : fixture.match_id;
    const date = pickDate(fixture.kickoff_utc || fixture.kickoff_et);
    const statusText = ready ? 'T1 / TA1 READY' : 'WAITING FOR FORM';
    const reason = ready ? '' : '<p class="waiting-reason"><strong>Forecast waiting:</strong> ' +
      escapeHtml(fixture.wait_reason || 'Enough current top-flight form has not been published yet.') + '</p>';
    return '<article class="worksheet" data-match-id="' + escapeHtml(matchId) + '" data-pick-date="' +
      escapeHtml(date) + '"><header class="worksheet-header"><div><h3>' +
      escapeHtml(fixture.home_team || 'Home') + ' vs ' + escapeHtml(fixture.away_team || 'Away') +
      '</h3><p>' + escapeHtml(fixture.league_name || fixture.league || 'League') + ' · Kickoff ' +
      escapeHtml(formatDateTime(fixture.kickoff_utc || fixture.kickoff_et)) + ' · Cutoff ' +
      escapeHtml(formatDateTime(fixture.data_cutoff_et)) + '</p></div><span class="status-pill ' +
      (ready ? '' : 'waiting') + '">' + statusText + '</span></header>' +
      '<p class="method-warning">T1 / TA1 only · T2 / T3 unavailable · not comparable to the full-baseline formula</p>' +
      '<div class="team-grid">' + formPanel(fixture, 'home') + formPanel(fixture, 'away') + '</div>' +
      forecastSection(fixture) + reason + '</article>';
  }

  function teamCard(team) {
    const context = team && team.lower_tier_context && typeof team.lower_tier_context === 'object' ?
      team.lower_tier_context : {};
    const averages = context.averages && typeof context.averages === 'object' ? context.averages : {};
    const count = finite(context.matches_counted);
    const source = team.lower_tier_division || team.source_alias || 'prior second tier';
    const season = context.season_label || context.season || '';
    return '<article class="team-card"><h3>' + escapeHtml(team.team || team.understat_team || 'Unknown club') +
      '</h3><span class="league-label">' + escapeHtml(team.league_name || team.league || 'Tracked league') +
      ' · promoted from ' + escapeHtml(source) + '</span><span class="sample-label">' +
      (count == null ? 'Context sample unavailable' : displayNumber(count, 0) + ' lower-tier matches') +
      (season ? ' · ' + escapeHtml(season) : '') + '</span><div class="context-stats">' +
      '<span><strong>' + displayNumber(averages.T) + '</strong>T</span>' +
      '<span><strong>' + displayNumber(averages.TA) + '</strong>TA</span>' +
      '<span><strong>' + displayNumber(averages.TR) + '</strong>TR</span>' +
      '<span><strong>' + displayNumber(averages.TAR) + '</strong>TAR</span></div>' +
      '<p class="context-note">Prior second-tier context only · excluded from forecasts</p></article>';
  }

  function dataMarker(data) {
    if (!data || !Array.isArray(data.fixtures)) return null;
    if (typeof data.generated_at_utc === 'string' && data.generated_at_utc) {
      return 'build:' + data.generated_at_utc;
    }
    return 'legacy:' + JSON.stringify(data.fixtures.map(function (fixture) {
      return [fixture.match_id, fixture.status, fixture.data_cutoff_et, fixture.forecasts];
    }));
  }

  function populateDateFilter(fixtures) {
    const previous = elements.dateFilter.value || 'all';
    const dates = new Map();
    fixtures.forEach(function (fixture) {
      const value = pickDate(fixture.kickoff_utc || fixture.kickoff_et);
      if (value && !dates.has(value)) dates.set(value, pickDateLabel(fixture.kickoff_utc || fixture.kickoff_et));
    });
    const options = ['<option value="all">All available days</option>'];
    Array.from(dates.entries()).sort(function (a, b) { return a[0].localeCompare(b[0]); })
      .forEach(function (entry) {
        options.push('<option value="' + escapeHtml(entry[0]) + '">' + escapeHtml(entry[1]) + '</option>');
      });
    elements.dateFilter.innerHTML = options.join('');
    elements.dateFilter.value = dates.has(previous) ? previous : 'all';
    elements.dateFilter.disabled = fixtures.length === 0;
    applyDateFilter();
  }

  function applyDateFilter() {
    const selected = elements.dateFilter.value || 'all';
    const cards = Array.from(elements.fixtures.querySelectorAll('.worksheet'));
    let shown = 0;
    cards.forEach(function (card) {
      const visible = selected === 'all' || card.dataset.pickDate === selected;
      card.classList.toggle('hidden', !visible);
      if (visible) shown += 1;
    });
    const option = elements.dateFilter.options[elements.dateFilter.selectedIndex];
    const label = option ? option.textContent : 'All available days';
    elements.dateStatus.textContent = cards.length ?
      'Showing ' + shown + ' of ' + cards.length + ' newcomer fixtures · ' + label :
      'No newcomer fixtures are currently published.';
    elements.dateEmpty.classList.toggle('hidden', shown > 0 || cards.length === 0);
  }

  function renderData(data) {
    validateData(data);
    currentData = data;
    elements.teamRoster.innerHTML = data.promoted_teams.map(teamCard).join('');
    elements.fixtures.innerHTML = data.fixtures.map(worksheet).join('');
    const readyCount = data.fixtures.filter(fixtureReady).length;
    const waitingCount = data.fixtures.length - readyCount;
    const countNote = data.promoted_teams.length === EXPECTED_TEAM_COUNT ?
      EXPECTED_TEAM_COUNT + ' of ' + EXPECTED_TEAM_COUNT + ' promoted clubs loaded' :
      data.promoted_teams.length + ' promoted clubs loaded; expected ' + EXPECTED_TEAM_COUNT;
    elements.datasetStatus.textContent = countNote + ' · ' + readyCount + ' ready · ' + waitingCount +
      ' waiting · generated ' + formatDateTime(data.generated_at_utc);
    elements.loading.classList.add('hidden');
    elements.fixturesEmpty.classList.toggle('hidden', data.fixtures.length > 0);
    populateDateFilter(data.fixtures);
    return data;
  }

  async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, timeoutMs || 15000);
    try {
      const settings = Object.assign({cache: 'no-store'}, options || {}, {signal: controller.signal});
      const response = await fetch(url, settings);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchLatestData(force) {
    const suffix = force ? '?refresh=' + Date.now() : '';
    return validateData(await fetchJson(DATA_URL + suffix));
  }

  async function reloadData(options) {
    const settings = options || {};
    elements.loading.textContent = settings.force ? 'Checking the newcomer dataset for updates…' :
      'Loading newcomer-only worksheets…';
    elements.loading.classList.remove('hidden');
    try {
      return renderData(await fetchLatestData(Boolean(settings.force)));
    } catch (error) {
      elements.loading.textContent = 'The newcomer-only dataset could not be loaded: ' + error.message + '.';
      return null;
    }
  }

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) { /* The refresh can continue in memory. */ }
  }

  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch (_) { /* No stored state to remove. */ }
  }

  function validateRefreshConfig(config, baseHref) {
    if (!config || typeof config !== 'object') throw new Error('invalid refresh configuration');
    if (config.mode !== 'gateway' && config.mode !== 'github') throw new Error('unsupported refresh mode');
    const result = Object.assign({}, config);
    const base = baseHref || 'https://example.invalid/league-one-newcomers/';
    if (config.mode === 'gateway') {
      const endpoint = new URL(config.endpoint, base);
      const statusEndpoint = new URL(config.status_endpoint, base);
      if (endpoint.origin !== GATEWAY_ORIGIN || endpoint.pathname !== REFRESH_PATH ||
          endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error('refresh endpoint is not the newcomer route');
      }
      if (statusEndpoint.protocol !== 'https:' || statusEndpoint.pathname !== RUN_STATUS_PATH ||
          statusEndpoint.origin !== endpoint.origin || statusEndpoint.username ||
          statusEndpoint.password || statusEndpoint.search || statusEndpoint.hash) {
        throw new Error('status endpoint is not the newcomer status route');
      }
      result.endpoint = endpoint.href;
      result.status_endpoint = statusEndpoint.href;
    }
    if (config.workflow_url) {
      const workflow = new URL(config.workflow_url, base);
      if (workflow.href !== WORKFLOW_URL) {
        throw new Error('workflow URL is not the fixed newcomer workflow');
      }
      result.workflow_url = workflow.href;
    }
    return result;
  }

  function validateRunStatusUrl(value) {
    const expected = new URL(refreshConfig.status_endpoint);
    const candidate = new URL(value, expected.href);
    if (candidate.protocol !== 'https:' || candidate.origin !== expected.origin ||
        candidate.pathname !== RUN_STATUS_PATH) {
      throw new Error('el servicio devolvió una ruta de estado que no pertenece a recién ascendidos');
    }
    return candidate.href;
  }

  function pendingRefresh() {
    const raw = safeSessionGet(PENDING_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.statusUrl === 'string' && Number.isFinite(parsed.startedAt) &&
          Date.now() - parsed.startedAt < 15 * 60 * 1000) return parsed;
    } catch (_) {
      // Remove malformed or expired state below.
    }
    safeSessionRemove(PENDING_STORAGE_KEY);
    return null;
  }

  function refreshLabel() {
    if (!refreshConfig) return 'Actualización no disponible';
    if (refreshConfig.mode === 'github') return 'Abrir GitHub para actualizar';
    return pendingRefresh() ? 'Reanudar actualización' : 'Actualizar recién ascendidos';
  }

  function updateRefreshControls(label) {
    elements.runRefresh.disabled = refreshBusy || !refreshConfig;
    elements.checkUpdate.disabled = refreshBusy;
    elements.runRefresh.textContent = label || refreshLabel();
  }

  function setRefreshBusy(value, label) {
    refreshBusy = value;
    updateRefreshControls(label);
  }

  function refreshCode() {
    if (!refreshConfig.requires_code) return '';
    return elements.codeInput.value.trim();
  }

  function authHeaders(code, includeJson) {
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (code) headers.Authorization = 'Bearer ' + code;
    return headers;
  }

  async function loadRefreshConfig() {
    try {
      refreshConfig = validateRefreshConfig(await fetchJson(REFRESH_CONFIG_URL), window.location.href);
      if (refreshConfig.workflow_url) {
        elements.workflowLink.href = refreshConfig.workflow_url;
        elements.workflowLink.classList.toggle('hidden', refreshConfig.mode !== 'github');
      }
      elements.refreshStatus.textContent = refreshConfig.mode === 'gateway' ?
        'Lista para ejecutar el actualizador independiente de recién ascendidos.' :
        'La actualización se inicia desde el flujo independiente de GitHub.';
    } catch (error) {
      refreshConfig = null;
      elements.refreshStatus.textContent = 'No se pudo cargar una configuración segura para esta página: ' + error.message + '.';
    }
    updateRefreshControls();
  }

  async function loadPublicRefreshStatus(strict) {
    try {
      const status = await fetchJson(REFRESH_STATUS_URL + '?check=' + Date.now());
      if (!status || typeof status !== 'object') throw new Error('invalid published status');
      publicRefreshStatus = status;
      return status;
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  }

  function workflowStateLabel(state) {
    return {
      queued: 'en cola', pending: 'pendiente', requested: 'solicitada',
      in_progress: 'en curso', running: 'en curso', waiting: 'en espera'
    }[state] || 'en curso';
  }

  async function pollWorkflow(statusUrl, code) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (attempt > 0) await new Promise(function (resolve) { setTimeout(resolve, 5000); });
      const state = await fetchJson(statusUrl, {headers: authHeaders(code, false)});
      const complete = state.status === 'completed' || state.conclusion;
      if (complete) {
        if (state.conclusion === 'success') return state;
        throw new Error('el flujo terminó con resultado ' + (state.conclusion || state.status));
      }
      elements.refreshStatus.textContent = 'Actualización de recién ascendidos ' + workflowStateLabel(state.status) + '…';
    }
    throw new Error('el flujo continúa ejecutándose; vuelve a reanudar la comprobación en un momento');
  }

  async function waitForPublishedData(oldMarker) {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (attempt > 0) await new Promise(function (resolve) { setTimeout(resolve, 5000); });
      try {
        const results = await Promise.all([fetchLatestData(true), loadPublicRefreshStatus(true)]);
        const data = results[0];
        const status = results[1];
        const marker = dataMarker(data);
        const buildMatches = !status.generated_at_utc || !data.generated_at_utc ||
          status.generated_at_utc === data.generated_at_utc;
        if (buildMatches && (!oldMarker || (marker && marker !== oldMarker))) {
          renderData(data);
          return data;
        }
      } catch (_) {
        // Publication is eventually consistent; retry within the bounded polling window.
      }
      elements.refreshStatus.textContent = 'El flujo terminó; esperando que se publique newcomers.json…';
    }
    return null;
  }

  async function checkForUpdate() {
    if (refreshBusy) return;
    const oldMarker = dataMarker(currentData);
    setRefreshBusy(true, 'Comprobando…');
    elements.refreshStatus.textContent = 'Comprobando solamente los archivos publicados de recién ascendidos…';
    try {
      const results = await Promise.all([fetchLatestData(true), loadPublicRefreshStatus(false)]);
      const data = results[0];
      renderData(data);
      elements.refreshStatus.textContent = oldMarker && dataMarker(data) !== oldMarker ?
        'Se cargaron datos nuevos de recién ascendidos.' :
        'No hay una publicación más reciente. Corte: ' + formatDateTime(data.data_cutoff_et, 'es-US') + '.';
    } catch (error) {
      elements.refreshStatus.textContent = 'No pude comprobar los datos de recién ascendidos: ' + error.message + '.';
    } finally {
      setRefreshBusy(false);
    }
  }

  function openWorkflow() {
    if (!refreshConfig || !refreshConfig.workflow_url) {
      elements.refreshStatus.textContent = 'La configuración no publicó un enlace para el flujo independiente.';
      return;
    }
    elements.workflowLink.classList.remove('hidden');
    const opened = window.open(refreshConfig.workflow_url, '_blank');
    if (opened) {
      try { opened.opener = null; } catch (_) { /* The new tab still remains isolated. */ }
      elements.refreshStatus.textContent = 'GitHub se abrió. Ejecuta el flujo de recién ascendidos y luego usa “Comprobar datos nuevos”.';
    } else {
      elements.refreshStatus.textContent = 'El navegador bloqueó la pestaña. Usa el enlace del flujo que aparece arriba.';
    }
  }

  async function runGatewayRefresh() {
    const code = refreshCode();
    if (refreshConfig.requires_code && !code) {
      elements.refreshStatus.textContent = 'Escribe tu código privado en el campo de contraseña para iniciar la actualización.';
      elements.codeInput.focus();
      return;
    }
    const oldMarker = dataMarker(currentData);
    setRefreshBusy(true, 'Actualizando…');
    try {
      let pending = pendingRefresh();
      if (!pending) {
        elements.refreshStatus.textContent = 'Solicitando el flujo independiente de recién ascendidos…';
        let started;
        try {
          started = await fetchJson(refreshConfig.endpoint, {
            method: 'POST', headers: authHeaders(code, true), body: '{}'
          });
        } catch (error) {
          throw error;
        }
        const statusUrl = validateRunStatusUrl(started.status_url);
        pending = {statusUrl: statusUrl, startedAt: Date.now()};
        safeSessionSet(PENDING_STORAGE_KEY, JSON.stringify(pending));
      }
      await pollWorkflow(pending.statusUrl, code);
      safeSessionRemove(PENDING_STORAGE_KEY);
      elements.refreshStatus.textContent = 'El flujo terminó correctamente; verificando la publicación independiente…';
      const published = await waitForPublishedData(oldMarker);
      elements.refreshStatus.textContent = published ?
        'La actualización de recién ascendidos ya está publicada. Corte: ' +
          formatDateTime(published.data_cutoff_et, 'es-US') + '.' :
        'El flujo terminó, pero la publicación sigue propagándose. Usa “Comprobar datos nuevos” en un momento.';
    } catch (error) {
      if (refreshConfig && refreshConfig.workflow_url) {
        elements.workflowLink.href = refreshConfig.workflow_url;
        elements.workflowLink.classList.remove('hidden');
      }
      elements.refreshStatus.textContent = 'No se pudo completar la actualización de recién ascendidos: ' + error.message + '.' +
        (refreshConfig && refreshConfig.workflow_url ? ' El enlace manual del flujo independiente está disponible arriba.' : '');
    } finally {
      elements.codeInput.value = '';
      setRefreshBusy(false);
    }
  }

  function runRefresh() {
    if (refreshBusy || !refreshConfig) return;
    if (refreshConfig.mode === 'github') openWorkflow();
    else runGatewayRefresh();
  }

  function submitQuery(question) {
    elements.queryResult.innerHTML = renderPlayerAnswer(answerPlayerQuery(currentData, question));
  }

  function init() {
    elements = {
      dateFilter: document.querySelector('#newcomer-date-filter'),
      dateStatus: document.querySelector('#date-filter-status'),
      dateEmpty: document.querySelector('#date-empty'),
      fixturesEmpty: document.querySelector('#fixtures-empty'),
      fixtures: document.querySelector('#newcomer-fixtures'),
      loading: document.querySelector('#loading'),
      teamRoster: document.querySelector('#promoted-teams'),
      datasetStatus: document.querySelector('#dataset-status'),
      queryForm: document.querySelector('#newcomer-query-form'),
      queryInput: document.querySelector('#newcomer-query-input'),
      queryResult: document.querySelector('#newcomer-query-result'),
      codeInput: document.querySelector('#newcomer-refresh-code'),
      runRefresh: document.querySelector('#run-newcomer-refresh'),
      checkUpdate: document.querySelector('#check-newcomer-update'),
      refreshStatus: document.querySelector('#newcomer-refresh-status'),
      workflowLink: document.querySelector('#newcomer-workflow-link')
    };
    if (Object.values(elements).some(function (element) { return !element; })) return;

    elements.dateFilter.addEventListener('change', applyDateFilter);
    elements.queryForm.addEventListener('submit', function (event) {
      event.preventDefault();
      submitQuery(elements.queryInput.value);
    });
    document.querySelectorAll('[data-query]').forEach(function (button) {
      button.addEventListener('click', function () {
        elements.queryInput.value = button.dataset.query;
        submitQuery(button.dataset.query);
      });
    });
    elements.runRefresh.addEventListener('click', runRefresh);
    elements.checkUpdate.addEventListener('click', checkForUpdate);

    reloadData({force: false}).then(function (data) {
      if (data && playerTeamRows(data).length) {
        elements.queryResult.innerHTML = '<p>Datos de jugadores de la temporada actual listos. Pregunta por tiros, tiros a puerta o ambas listas.</p>';
      }
    });
    loadRefreshConfig();
    loadPublicRefreshStatus(false);
  }

  return {
    DATA_URL: DATA_URL,
    REFRESH_CONFIG_URL: REFRESH_CONFIG_URL,
    REFRESH_STATUS_URL: REFRESH_STATUS_URL,
    REFRESH_PATH: REFRESH_PATH,
    RUN_STATUS_PATH: RUN_STATUS_PATH,
    GATEWAY_ORIGIN: GATEWAY_ORIGIN,
    WORKFLOW_URL: WORKFLOW_URL,
    EXPECTED_TEAM_COUNT: EXPECTED_TEAM_COUNT,
    answerPlayerQuery: answerPlayerQuery,
    dataMarker: dataMarker,
    pickDate: pickDate,
    renderPlayerAnswer: renderPlayerAnswer,
    topPlayers: topPlayers,
    validateData: validateData,
    validateRefreshConfig: validateRefreshConfig,
    init: init
  };
});
