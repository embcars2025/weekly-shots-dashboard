(function () {
  'use strict';

  const toggle = document.querySelector('#data-assistant-toggle');
  const panel = document.querySelector('#data-assistant');
  const close = document.querySelector('#assistant-close');
  const status = document.querySelector('#assistant-status');
  const messages = document.querySelector('#assistant-messages');
  const form = document.querySelector('#assistant-form');
  const input = document.querySelector('#assistant-input');
  const quickForm = document.querySelector('#quick-assistant-form');
  const quickInput = document.querySelector('#quick-assistant-input');
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
    if (!value) return 'corte no disponible';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('es-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York', timeZoneName: 'short'
    }).format(parsed);
  }

  function translatedRunStatus(value) {
    return {
      queued:'en cola', in_progress:'en curso', completed:'completada', running:'en curso',
      pending:'pendiente', waiting:'en espera', requested:'solicitada'
    }[value] || 'en curso';
  }

  function translatedConclusion(value) {
    return {
      success:'éxito', failure:'error', cancelled:'cancelada', timed_out:'tiempo agotado',
      action_required:'acción requerida', neutral:'resultado neutral', skipped:'omitida', stale:'obsoleta'
    }[value] || 'un error';
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
    label.textContent = role === 'user' ? 'Tú' : 'La cabezona de Donald Trump';
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
        button.textContent = uniqueIds.length === 1 ? 'Ver hoja' : 'Ver hoja ' + (index + 1);
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
    let worksheet = window.dashboardApp.revealMatch ? window.dashboardApp.revealMatch(matchId) : null;
    try {
      worksheet = worksheet || document.querySelector('.worksheet[data-match-id="' + CSS.escape(String(matchId)) + '"]');
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
        'Hola Brayan yo soy la cabezona de Donald Trump el mejor presidente de el mundo. Me an contado mucho de ti y que no te caigo bien pero por lo que veo te ace falta mi ayuda ahora verdad?! Que quieres?!!!'
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
    if (pending && refreshConfig.mode === 'gateway') return 'Reanudar actualización';
    return refreshConfig.mode === 'gateway' ? 'Actualizar datos' : 'Abrir GitHub para actualizar';
  }

  function updateControls(refreshLabel) {
    refreshButton.disabled = busy || !configLoaded;
    checkButton.disabled = busy;
    refreshButton.textContent = refreshLabel || normalRefreshLabel();
    checkButton.textContent = busy ? 'Espera…' : 'Comprobar datos nuevos';
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
    status.textContent = engine.fixtures.length + ' partido' +
      (engine.fixtures.length === 1 ? '' : 's') + ' elegible' +
      (engine.fixtures.length === 1 ? '' : 's') + ' cargado' +
      (engine.fixtures.length === 1 ? '' : 's') + ' · ' + formatCutoff(cutoff);
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
      if (!response.ok) throw new Error('el estado de actualización devolvió HTTP ' + response.status);
      const nextState = await response.json();
      if (!nextState || typeof nextState !== 'object') throw new Error('el estado de actualización no era válido');
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
      if (!response.ok) throw new Error('la configuración de actualización devolvió HTTP ' + response.status);
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
        code = window.prompt('Ingresa tu código privado de actualización. Se guardará únicamente en esta pestaña del navegador.') || '';
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
    setBusy(true, 'Comprobando…');
    try {
      const data = await latestDashboard();
      if (!data) throw new Error('el tablero no devolvió datos');
      window.dashboardApp.applyData(data, {force: true, announce: false});
      await loadRefreshState(false);
      const newMarker = datasetMarker(data);
      if (oldMarker && newMarker && oldMarker !== newMarker) {
        appendMessage('assistant', 'Se cargaron datos recién generados. Su corte es ' + formatCutoff(cutoffOf(data) || buildIdOf(data)) + '.');
      } else {
        appendMessage('assistant', 'Comprobé el conjunto de datos publicado. Todavía muestra el corte ' + formatCutoff(cutoffOf(data) || buildIdOf(data)) + '.');
      }
    } catch (error) {
      appendMessage('assistant', 'No pude comprobar el conjunto de datos publicado: ' + error.message + '. Inténtalo de nuevo.');
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
            'El tablero actualizado ya está publicado. Su corte de datos ahora es ' +
              formatCutoff(cutoffOf(data) || dataBuildId) + '.'
          );
          return true;
        }
      } catch (_) {
        hadFetchFailure = true;
      }
    }
    if (hadFetchFailure) {
      appendMessage('assistant', 'La fórmula terminó correctamente, pero no pude verificar el conjunto de datos recién publicado. Usa “Comprobar datos nuevos” en un momento.');
    } else {
      appendMessage('assistant', 'La fórmula terminó correctamente, pero la página pública aún está terminando su despliegue. Usa “Comprobar datos nuevos” en un momento.');
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
        'GitHub se abrió en una pestaña nueva. Elige “Run workflow” y deja vacías las dos casillas opcionales para que el actualizador use la hora actual. Cuando termine, vuelve aquí y elige “Comprobar datos nuevos”.'
      );
    } else {
      appendMessage(
        'assistant',
        'Tu navegador bloqueó la pestaña nueva. Usa el enlace “Abrir el flujo privado de GitHub” que aparece abajo, deja vacías las dos casillas opcionales y luego vuelve aquí para comprobar los datos nuevos.'
      );
    }
  }

  function validatedStatusUrl(value) {
    const expected = new URL(refreshConfig.status_endpoint || refreshConfig.endpoint);
    const candidate = new URL(value, window.location.href);
    if (candidate.origin !== expected.origin || candidate.pathname !== '/api/refresh/status') {
      throw new Error('el servicio de actualización devolvió una dirección de estado no válida');
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
      if (!response.ok) throw new Error('la consulta de estado devolvió HTTP ' + response.status);
      const result = await response.json();
      if (result.status === 'completed') {
        if (result.conclusion !== 'success') {
          forgetRefresh();
          throw new Error('la actualización de GitHub terminó con ' + translatedConclusion(result.conclusion));
        }
        appendMessage('assistant', 'La actualización de la fórmula terminó correctamente. Ahora estoy esperando el tablero recién publicado.');
        const published = await waitForPublishedUpdate(oldBuildId, oldMarker);
        if (published) forgetRefresh();
        return;
      }
      status.textContent = 'Actualización ' + translatedRunStatus(result.status) + '…';
    }
    throw new Error('la actualización sigue en curso después de ocho minutos');
  }

  async function resumeRefresh(pending, code) {
    appendMessage('assistant', 'Reanudando la actualización de datos que ya fue aceptada.');
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
      appendMessage('assistant', 'La actualización no se inició porque no se ingresó el código privado.');
      return;
    }

    const pending = pendingRefresh();
    setBusy(true, pending ? 'Reanudando…' : 'Iniciando…');
    let accepted = Boolean(pending);
    try {
      if (pending) {
        await resumeRefresh(pending, code);
        return;
      }

      const current = window.dashboardApp.getData();
      const oldBuildId = buildIdOf(current);
      const oldMarker = datasetMarker(current);
      appendMessage('assistant', 'Iniciando una descarga nueva de datos y una ejecución de la fórmula con la hora actual…');
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
        throw new Error(result.error || 'la solicitud de actualización devolvió HTTP ' + response.status);
      }
      accepted = true;
      appendMessage('assistant', 'Actualización aceptada. Actualizaré la página cuando GitHub termine.');
      const rawStatusUrl = result.status_url || (result.run_id && refreshConfig.status_endpoint
        ? refreshConfig.status_endpoint + '?run_id=' + encodeURIComponent(result.run_id) : '');
      if (!rawStatusUrl) throw new Error('el servicio de actualización no proporcionó un estado de ejecución');
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
          'La actualización fue aceptada, pero no pude seguir su estado: ' + error.message +
            '. Puede que todavía esté en curso. Usa “Reanudar actualización” o “Comprobar datos nuevos”; no inicies otra ejecución.'
        );
      } else {
        showGitHubLink(
          'No pude iniciar la actualización directa: ' + error.message +
            '. Puedes usar el enlace del flujo privado de GitHub que aparece abajo.'
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

  function askQuestion(question) {
    const value = String(question || '').trim();
    if (!value) return;
    openPanel();
    appendMessage('user', value);
    const result = engine.answer(value);
    if (result.text) appendMessage('assistant', result.text, result.matchIds);
    if (result.action === 'refresh') startRefresh();
    if (result.action === 'check') checkForUpdate();
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
    input.value = '';
    askQuestion(question);
  });

  quickForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const question = quickInput.value.trim();
    if (!question) return;
    quickInput.value = '';
    askQuestion(question);
  });

  document.addEventListener('dashboard:data', function (event) {
    setData(event.detail.data);
  });
  document.addEventListener('dashboard:error', function (event) {
    status.textContent = 'Datos publicados no disponibles';
    if (event.detail.force && event.detail.announce) {
      appendMessage('assistant', 'No pude comprobar los datos publicados: ' + event.detail.error.message + '.');
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
