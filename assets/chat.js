(function () {
  'use strict';

  const toggle = document.querySelector('#data-assistant-toggle');
  const panel = document.querySelector('#data-assistant');
  const close = document.querySelector('#assistant-close');
  const status = document.querySelector('#assistant-status');
  const messages = document.querySelector('#assistant-messages');
  const form = document.querySelector('#assistant-form');
  const input = document.querySelector('#assistant-input');
  const refreshButton = document.querySelector('#run-data-refresh');
  const checkButton = document.querySelector('#check-data-update');
  const githubLink = document.querySelector('#github-refresh-link');
  const workflowUrl = refreshButton.dataset.workflowUrl;

  let engine = window.DashboardChatEngine.createEngine(null);
  let refreshState = null;
  let welcomed = false;
  let busy = false;
  let configLoaded = false;
  let fallbackLinkVisible = false;
  let refreshConfig = {mode: 'github', workflow_url: workflowUrl};
  let configReady;

  function storageGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_) {
      // The refresh still works when private browsing blocks session storage.
    }
  }

  function storageRemove(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (_) {
      // Nothing else is required when storage is unavailable.
    }
  }

  function cutoffOf(data) {
    const values = (data && data.fixtures || []).map(function (fixture) {
      return fixture.data_cutoff_et;
    }).filter(Boolean).sort();
    return values.length ? values[values.length - 1] : null;
  }

  function buildIdOf(data) {
    return data && typeof data.generated_at_utc === 'string' ? data.generated_at_utc : null;
  }

  function datasetMarker(data) {
    if (!data || !Array.isArray(data.fixtures)) return null;
    const buildId = buildIdOf(data);
    if (buildId) return 'build:' + buildId;
    const rows = data.fixtures.map(function (fixture) {
      return [
        fixture.match_id,
        fixture.data_cutoff_et,
        fixture.kickoff_utc,
        JSON.stringify(fixture.forecasts || {})
      ].join('|');
    }).sort();
    return 'legacy:' + rows.join('||');
  }

  function formatCutoff(value) {
    if (!value) return 'cutoff unavailable';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York', timeZoneName: 'short'
    }).format(parsed);
  }

  function safeWorkflowUrl() {
    try {
      const candidate = new URL(refreshConfig.workflow_url || workflowUrl);
      if (candidate.protocol === 'https:' && candidate.hostname === 'github.com') return candidate.href;
    } catch (_) {
      // Use the fixed repository workflow URL below.
    }
    return workflowUrl;
  }

  function appendMessage(role, text, matchIds) {
    const item = document.createElement('div');
    item.className = 'assistant-message ' + role;

    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'You' : 'Data assistant';
    item.appendChild(label);

    if (text) {
      const body = document.createElement('p');
      body.textContent = text;
      item.appendChild(body);
    }

    const uniqueIds = Array.from(new Set((matchIds || []).map(String))).slice(0, 3);
    if (uniqueIds.length) {
      const actions = document.createElement('div');
      actions.className = 'assistant-message-actions';
      uniqueIds.forEach(function (matchId, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = uniqueIds.length === 1 ? 'Show worksheet' : 'Show worksheet ' + (index + 1);
        button.addEventListener('click', function () {
          showWorksheet(matchId);
        });
        actions.appendChild(button);
      });
      item.appendChild(actions);
    }

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function showGitHubLink(message) {
    githubLink.href = safeWorkflowUrl();
    fallbackLinkVisible = true;
    githubLink.classList.remove('hidden');
    if (message) appendMessage('assistant', message);
  }

  function showWorksheet(matchId) {
    let worksheet;
    try {
      worksheet = document.querySelector('.worksheet[data-match-id="' + CSS.escape(String(matchId)) + '"]');
    } catch (_) {
      worksheet = Array.from(document.querySelectorAll('.worksheet')).find(function (item) {
        return item.dataset.matchId === String(matchId);
      });
    }
    if (!worksheet) return;
    panel.hidden = true;
    panel.removeAttribute('aria-modal');
    toggle.setAttribute('aria-expanded', 'false');
    worksheet.scrollIntoView({behavior: 'smooth', block: 'start'});
    worksheet.classList.add('worksheet-highlight');
    window.setTimeout(function () {
      worksheet.classList.remove('worksheet-highlight');
    }, 2200);
    const heading = worksheet.querySelector('h2');
    if (heading) heading.focus({preventScroll: true});
  }

  function smallScreenDialog() {
    return window.matchMedia && window.matchMedia('(max-width: 620px), (max-height: 520px)').matches;
  }

  function openPanel() {
    panel.hidden = false;
    if (smallScreenDialog()) panel.setAttribute('aria-modal', 'true');
    else panel.removeAttribute('aria-modal');
    toggle.setAttribute('aria-expanded', 'true');
    if (!welcomed) {
      appendMessage(
        'assistant',
        'Ask me for matches, teams, forecasts, shots, SOT, form, positions, H2H, formula components, red-card rows, rankings, or complete worksheet data. You can request a refresh at any time.'
      );
      welcomed = true;
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    panel.removeAttribute('aria-modal');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  function normalRefreshLabel() {
    const pending = pendingRefresh();
    if (pending && refreshConfig.mode === 'gateway') return 'Resume data refresh';
    return refreshConfig.mode === 'gateway' ? 'Run data refresh' : 'Open GitHub to run refresh';
  }

  function updateControls(refreshLabel) {
    refreshButton.disabled = busy || !configLoaded;
    checkButton.disabled = busy;
    refreshButton.textContent = refreshLabel || normalRefreshLabel();
    checkButton.textContent = busy ? 'Please wait…' : 'Check for updated data';
    const githubMode = configLoaded && refreshConfig.mode !== 'gateway';
    githubLink.classList.toggle('hidden', !githubMode && !fallbackLinkVisible);
    if (githubMode) githubLink.href = safeWorkflowUrl();
  }

  function setBusy(value, label) {
    busy = value;
    updateControls(label);
  }

  function setData(data) {
    engine = window.DashboardChatEngine.createEngine(data);
    const cutoff = cutoffOf(data) || buildIdOf(data);
    status.textContent = engine.fixtures.length + ' eligible match' +
      (engine.fixtures.length === 1 ? '' : 'es') + ' loaded · ' + formatCutoff(cutoff);
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, timeoutMs || 15000);
    try {
      const merged = Object.assign({}, options || {}, {signal: controller.signal});
      return await fetch(url, merged);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function latestDashboard() {
    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, 15000);
    try {
      return await window.dashboardApp.fetchLatest(true, {signal: controller.signal});
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function loadRefreshState(strict) {
    try {
      const response = await fetchWithTimeout(
        './data/refresh-status.json?check=' + Date.now(),
        {cache: 'no-store'},
        15000
      );
      if (!response.ok) throw new Error('refresh status returned HTTP ' + response.status);
      const nextState = await response.json();
      if (!nextState || typeof nextState !== 'object') throw new Error('refresh status was invalid');
      refreshState = nextState;
      return nextState;
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  }

  async function loadRefreshConfig() {
    try {
      const response = await fetchWithTimeout('./data/refresh-config.json', {cache: 'no-store'}, 15000);
      if (!response.ok) throw new Error('refresh configuration returned HTTP ' + response.status);
      const config = await response.json();
      if (config && (config.mode === 'gateway' || config.mode === 'github')) refreshConfig = config;
    } catch (_) {
      refreshConfig = {mode: 'github', workflow_url: workflowUrl};
    } finally {
      configLoaded = true;
      updateControls();
    }
  }

  function refreshCode() {
    if (!refreshConfig.requires_code) return '';
    let code = storageGet('weekly-dashboard-refresh-code') || '';
    if (!code) {
      try {
        code = window.prompt('Enter your private dashboard refresh code. It will be kept only in this browser tab.') || '';
      } catch (_) {
        code = '';
      }
      if (code) storageSet('weekly-dashboard-refresh-code', code);
    }
    return code;
  }

  function pendingRefresh() {
    const raw = storageGet('weekly-dashboard-pending-refresh');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const valid = parsed && typeof parsed.statusUrl === 'string' &&
        Number.isFinite(parsed.startedAt) && Date.now() - parsed.startedAt < 10 * 60 * 1000;
      if (valid) return parsed;
    } catch (_) {
      // Invalid state is removed below.
    }
    storageRemove('weekly-dashboard-pending-refresh');
    return null;
  }

  function rememberRefresh(value) {
    storageSet('weekly-dashboard-pending-refresh', JSON.stringify(value));
    updateControls();
  }

  function forgetRefresh() {
    storageRemove('weekly-dashboard-pending-refresh');
    updateControls();
  }

  async function checkForUpdate() {
    openPanel();
    if (busy) return;
    const current = window.dashboardApp.getData();
    const oldMarker = datasetMarker(current);
    setBusy(true, 'Checking…');
    try {
      const data = await latestDashboard();
      if (!data) throw new Error('the dashboard returned no data');
      window.dashboardApp.applyData(data, {force: true, announce: false});
      await loadRefreshState(false);
      const newMarker = datasetMarker(data);
      if (oldMarker && newMarker && oldMarker !== newMarker) {
        appendMessage('assistant', 'Newly generated data loaded. Its cutoff is ' + formatCutoff(cutoffOf(data) || buildIdOf(data)) + '.');
      } else {
        appendMessage('assistant', 'I checked the published dataset. It still shows ' + formatCutoff(cutoffOf(data) || buildIdOf(data)) + '.');
      }
    } catch (error) {
      appendMessage('assistant', 'I could not check the published dataset: ' + error.message + '. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function waitForPublishedUpdate(oldBuildId, oldMarker) {
    let hadFetchFailure = false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (attempt > 0) {
        await new Promise(function (resolve) {
          window.setTimeout(resolve, 5000);
        });
      }
      try {
        const state = await loadRefreshState(true);
        const data = await latestDashboard();
        const statusBuildId = state && state.generated_at_utc;
        const dataBuildId = buildIdOf(data);
        const newMarker = datasetMarker(data);
        const matchingBuild = Boolean(statusBuildId && dataBuildId && statusBuildId === dataBuildId);
        const changedBuild = matchingBuild && dataBuildId !== oldBuildId;
        const changedLegacyData = !statusBuildId && !dataBuildId && newMarker && newMarker !== oldMarker;
        if (changedBuild || changedLegacyData) {
          window.dashboardApp.applyData(data, {force: true, announce: false});
          appendMessage(
            'assistant',
            'The refreshed dashboard is published. Its data cutoff is now ' +
              formatCutoff(cutoffOf(data) || dataBuildId) + '.'
          );
          return true;
        }
      } catch (_) {
        hadFetchFailure = true;
      }
    }
    if (hadFetchFailure) {
      appendMessage('assistant', 'The formula run succeeded, but I could not verify the newly published dataset. Use “Check for updated data” in a moment.');
    } else {
      appendMessage('assistant', 'The formula run succeeded, but the public page is still finishing its deployment. Use “Check for updated data” in a moment.');
    }
    return false;
  }

  function openGitHubRefresh() {
    const url = safeWorkflowUrl();
    githubLink.href = url;
    githubLink.classList.remove('hidden');
    const opened = window.open(url, '_blank');
    if (opened) {
      try {
        opened.opener = null;
      } catch (_) {
        // The opened GitHub tab can still continue independently.
      }
    }
    if (opened) {
      appendMessage(
        'assistant',
        'GitHub opened in a new tab. Choose “Run workflow” and leave both optional boxes blank so the updater uses the current time. When it finishes, return here and choose “Check for updated data.”'
      );
    } else {
      appendMessage(
        'assistant',
        'Your browser blocked the new tab. Use the “Open the private GitHub refresh workflow” link below, leave both optional boxes blank, then return here to check for updated data.'
      );
    }
  }

  function validatedStatusUrl(value) {
    const expected = new URL(refreshConfig.status_endpoint || refreshConfig.endpoint);
    const candidate = new URL(value, window.location.href);
    if (candidate.origin !== expected.origin || candidate.pathname !== '/api/refresh/status') {
      throw new Error('the refresh service returned an invalid status address');
    }
    return candidate.href;
  }

  async function pollRefresh(url, code, oldBuildId, oldMarker) {
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 5000);
      });
      const response = await fetchWithTimeout(url, {
        cache: 'no-store',
        headers: code ? {Authorization: 'Bearer ' + code} : {},
        credentials: 'omit'
      }, 15000);
      if (!response.ok) throw new Error('status check returned HTTP ' + response.status);
      const result = await response.json();
      if (result.status === 'completed') {
        if (result.conclusion !== 'success') {
          forgetRefresh();
          throw new Error('GitHub refresh ended with ' + (result.conclusion || 'an error'));
        }
        appendMessage('assistant', 'The formula refresh finished successfully. I am waiting for the newly published dashboard now.');
        const published = await waitForPublishedUpdate(oldBuildId, oldMarker);
        if (published) forgetRefresh();
        return;
      }
      status.textContent = 'Refresh ' + (result.status || 'running') + '…';
    }
    throw new Error('the refresh is still running after eight minutes');
  }

  async function resumeRefresh(pending, code) {
    appendMessage('assistant', 'Resuming the data refresh that was already accepted.');
    await pollRefresh(pending.statusUrl, code, pending.oldBuildId || null, pending.oldMarker || null);
  }

  async function startRefresh() {
    openPanel();
    if (busy) return;
    await configReady;

    if (refreshConfig.mode !== 'gateway' || !refreshConfig.endpoint) {
      openGitHubRefresh();
      return;
    }

    const code = refreshCode();
    if (refreshConfig.requires_code && !code) {
      appendMessage('assistant', 'The refresh was not started because the private refresh code was not entered.');
      return;
    }

    const pending = pendingRefresh();
    setBusy(true, pending ? 'Resuming refresh…' : 'Starting refresh…');
    let accepted = Boolean(pending);
    try {
      if (pending) {
        await resumeRefresh(pending, code);
        return;
      }

      const current = window.dashboardApp.getData();
      const oldBuildId = buildIdOf(current);
      const oldMarker = datasetMarker(current);
      appendMessage('assistant', 'Starting a fresh data pull and formula run using the current time…');
      const headers = {'Content-Type': 'application/json', 'X-Requested-With': 'weekly-dashboard'};
      if (code) headers.Authorization = 'Bearer ' + code;
      const response = await fetchWithTimeout(refreshConfig.endpoint, {
        method: 'POST', headers: headers, credentials: 'omit', body: JSON.stringify({action: 'refresh'})
      }, 15000);
      const result = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        if (response.status === 401) storageRemove('weekly-dashboard-refresh-code');
        throw new Error(result.error || 'refresh request returned HTTP ' + response.status);
      }
      accepted = true;
      appendMessage('assistant', 'Refresh accepted. I will update the page when GitHub finishes.');
      const rawStatusUrl = result.status_url || (result.run_id && refreshConfig.status_endpoint
        ? refreshConfig.status_endpoint + '?run_id=' + encodeURIComponent(result.run_id) : '');
      if (!rawStatusUrl) throw new Error('the refresh service did not provide a run status');
      const statusUrl = validatedStatusUrl(rawStatusUrl);
      const tracking = {
        statusUrl: statusUrl,
        oldBuildId: oldBuildId,
        oldMarker: oldMarker,
        startedAt: Date.now()
      };
      rememberRefresh(tracking);
      await pollRefresh(statusUrl, code, oldBuildId, oldMarker);
    } catch (error) {
      if (accepted) {
        appendMessage(
          'assistant',
          'The refresh was accepted, but I could not keep tracking it: ' + error.message +
            '. It may still be running. Use “Resume data refresh” or “Check for updated data”; do not start a second run.'
        );
      } else {
        showGitHubLink(
          'I could not start the direct refresh: ' + error.message +
            '. You can use the private GitHub workflow link below.'
        );
      }
    } finally {
      setBusy(false);
      const data = window.dashboardApp.getData();
      if (data) setData(data);
    }
  }

  function focusableInPanel() {
    return Array.from(panel.querySelectorAll('button:not([disabled]), a[href]:not(.hidden), input:not([disabled])'))
      .filter(function (element) {
        return element.offsetParent !== null;
      });
  }

  toggle.addEventListener('click', function () {
    if (panel.hidden) openPanel();
    else closePanel();
  });
  close.addEventListener('click', closePanel);
  refreshButton.addEventListener('click', startRefresh);
  checkButton.addEventListener('click', checkForUpdate);

  document.querySelectorAll('[data-question]').forEach(function (button) {
    button.addEventListener('click', function () {
      input.value = button.dataset.question;
      form.requestSubmit();
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    appendMessage('user', question);
    input.value = '';
    const result = engine.answer(question);
    if (result.text) appendMessage('assistant', result.text, result.matchIds);
    if (result.action === 'refresh') startRefresh();
    if (result.action === 'check') checkForUpdate();
  });

  document.addEventListener('dashboard:data', function (event) {
    setData(event.detail.data);
  });
  document.addEventListener('dashboard:error', function (event) {
    status.textContent = 'Published data unavailable';
    if (event.detail.force && event.detail.announce) {
      appendMessage('assistant', 'I could not check the published data: ' + event.detail.error.message + '.');
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
      return;
    }
    if (event.key !== 'Tab' || panel.hidden || !smallScreenDialog()) return;
    const controls = focusableInPanel();
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const existing = window.dashboardApp.getData();
  if (existing) setData(existing);
  configReady = loadRefreshConfig();
  Promise.all([configReady, loadRefreshState(false)]).then(function () {
    const data = window.dashboardApp.getData();
    if (data) setData(data);
    updateControls();
  });
})();
