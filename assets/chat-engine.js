(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DashboardChatEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOP_WORDS = new Set([
    'a','about','all','and','are','can','data','do','for','from','give','has','have','i','in','is',
    'match','matches','me','of','on','please','show','tell','the','this','to','what','which','with',
    'de','del','el','en','la','las','lo','los','para','por','que','un','una','uno'
  ]);

  const LEAGUE_ALIASES = {
    'Premier League': ['premier league', 'epl', 'english league', 'liga inglesa'],
    'La Liga': ['la liga', 'laliga', 'spanish league', 'liga espanola'],
    'Ligue 1': ['ligue 1', 'ligue one', 'french league', 'liga francesa'],
    'Serie A': ['serie a', 'italian league', 'liga italiana']
  };

  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const DAY_LABELS = {
    sunday:'domingo', monday:'lunes', tuesday:'martes', wednesday:'miércoles',
    thursday:'jueves', friday:'viernes', saturday:'sábado'
  };

  function words(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function intentWords(value) {
    let result = words(value);
    const phrases = [
      [/\bla liga\b/g, 'laliga'],
      [/\bliga inglesa\b/g, 'english league'],
      [/\bliga espanola\b/g, 'spanish league'],
      [/\bliga francesa\b/g, 'french league'],
      [/\bliga italiana\b/g, 'italian league'],
      [/\b(?:tiros?|disparos?|remates?) (?:a|al) (?:puerta|porteria|arco)\b/g, 'shots on target'],
      [/\b(?:tiradores?|jugadores?) (?:a|al) (?:puerta|porteria|arco)\b/g, 'shooters on target'],
      [/\bentre los tres palos\b/g, 'shots on target'],
      [/\bcara a cara\b/g, 'head to head'],
      [/\benfrentamientos? directos?\b/g, 'head to head'],
      [/\btemporada anterior\b/g, 'previous season'],
      [/\btarjetas? rojas?\b/g, 'red cards'],
      [/\b(?:expulsados?|expulsiones)\b/g, 'red cards'],
      [/\btodos los datos\b/g, 'all data'],
      [/\bdetalles completos\b/g, 'complete details'],
      [/\bforma reciente\b/g, 'form'],
      [/\bultimos partidos\b/g, 'form'],
      [/\bcomponentes de la formula\b/g, 'formula components'],
      [/\bultima actualizacion\b/g, 'last updated'],
      [/\bultima vez que se actualizo\b/g, 'last refreshed'],
      [/\bcuando se actualizaron? los datos\b/g, 'when updated'],
      [/\bcuando se refrescaron? los datos\b/g, 'when refreshed'],
      [/\bfecha de los datos\b/g, 'data date'],
      [/\bbuscar datos actualizados\b/g, 'check for updated data'],
      [/\bcomprobar (?:datos|actualizaciones)\b/g, 'check updated data'],
      [/\b(?:comprueba|revisa|verifica) si hay datos nuevos\b/g, 'check for new data'],
      [/\brecargar (?:la )?(?:pagina|tablero)\b/g, 'reload page'],
      [/\bactualiza (?:la )?pagina\b/g, 'update the page'],
      [/\b(?:actualiza|actualizar|refresca|refrescar) (?:los )?datos\b/g, 'refresh data'],
      [/\b(?:actualiza|actualizar|refresca|refrescar) (?:el )?tablero\b/g, 'refresh dashboard'],
      [/\b(?:actualiza|actualizar|refresca|refrescar) (?:la )?formula\b/g, 'refresh formula'],
      [/\bpor favor\b/g, 'please'],
      [/\bpor encima de\b/g, 'above'],
      [/\bal menos\b/g, 'at least'],
      [/\bcomo maximo\b/g, 'at most'],
      [/\bmas de (?=\d)\b/g, 'over '],
      [/\bmenos de (?=\d)\b/g, 'under ']
    ];
    phrases.forEach(([pattern, replacement]) => {
      result = result.replace(pattern, replacement);
    });
    const tokenMap = {
      ayuda:'help', ejemplos:'examples', comandos:'commands',
      muestra:'show', muestrame:'show', mostrar:'show', ensena:'show', ensename:'show',
      lista:'list', listar:'list', busca:'find', buscar:'find', dame:'give',
      cual:'which', cuales:'which', quien:'who', quienes:'who', cuantos:'how many', cuantas:'how many',
      todos:'all', todas:'all', cada:'each', y:'and',
      partido:'match', partidos:'matches', encuentro:'match', encuentros:'matches', juegos:'games', calendario:'schedule',
      equipo:'team', equipos:'teams', club:'club', clubes:'clubs',
      liga:'league', ligas:'leagues',
      jugador:'player', jugadores:'players', tirador:'shooter', tiradores:'shooters', rematador:'shooter', rematadores:'shooters',
      mejores:'top', mejor:'top', maximo:'highest', maxima:'highest', mayor:'highest', mas:'most', lider:'top', lideres:'top',
      menor:'lowest', minimo:'lowest', minima:'lowest', menos:'fewest',
      tiro:'shot', tiros:'shots', disparo:'shot', disparos:'shots', remate:'shot', remates:'shots',
      objetivo:'target', combinados:'combined', combinadas:'combined', combinado:'combined', combinada:'combined',
      totales:'total', total:'total',
      pronostico:'forecast', prediccion:'forecast',
      forma:'form', reciente:'recent', recientes:'recent', muestras:'sample', seleccion:'sample',
      promedio:'average', promedios:'averages', recibidos:'received', recibidas:'received',
      posicion:'position', posiciones:'positions', clasificacion:'standings', rango:'rank',
      formula:'formula', componente:'component', componentes:'components',
      saque:'kickoff', inicio:'kickoff', fecha:'date', hora:'time', cuando:'when',
      actualizar:'refresh', actualiza:'refresh', actualizalo:'refresh', refrescar:'refresh', refresca:'refresh',
      revisar:'check', revisa:'check', verifica:'check', verificar:'check',
      datos:'data', dato:'data', tablero:'dashboard', pagina:'page', ahora:'now',
      uno:'one', dos:'two', tres:'three', cuatro:'four', cinco:'five',
      seis:'six', siete:'seven', ocho:'eight', nueve:'nine', diez:'ten',
      domingo:'sunday', lunes:'monday', martes:'tuesday', miercoles:'wednesday',
      jueves:'thursday', viernes:'friday', sabado:'saturday'
    };
    return result.split(' ').map(token => tokenMap[token] || token).join(' ').trim();
  }

  function compact(value) {
    return words(value).replace(/\s+/g, '');
  }

  function phraseIncluded(query, phrase) {
    const q = ` ${words(query)} `;
    const p = words(phrase);
    return p && q.includes(` ${p} `);
  }

  function number(value, digits = 1) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : 'no disponible';
  }

  function dateTime(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value ?? 'no disponible');
    return new Intl.DateTimeFormat('es-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short'
    }).format(parsed);
  }

  function shortDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value ?? 'no disponible');
    return new Intl.DateTimeFormat('es-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York'
    }).format(parsed);
  }

  function fixtureName(fixture) {
    return `${fixture.home_team} vs ${fixture.away_team}`;
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function createEngine(payload) {
    const loaded = Boolean(payload && Array.isArray(payload.fixtures));
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
    const playerStats = Array.isArray(payload?.player_stats?.teams) ? payload.player_stats.teams : [];
    const teams = unique(fixtures.flatMap(f => [f.home_team, f.away_team])).sort();
    const leagues = unique(fixtures.map(f => f.league_name)).sort();
    const teamTokens = new Map();
    teams.forEach(team => {
      words(team).split(' ').filter(token => token.length >= 4).forEach(token => {
        if (!teamTokens.has(token)) teamTokens.set(token, []);
        teamTokens.get(token).push(team);
      });
    });

    function mentionedTeams(query) {
      const q = words(query);
      const hits = teams.filter(team => phraseIncluded(q, team) || compact(q).includes(compact(team)));
      for (const token of q.split(' ')) {
        const candidates = teamTokens.get(token) || [];
        if (candidates.length === 1) hits.push(candidates[0]);
      }
      return unique(hits).sort((a, b) => b.length - a.length);
    }

    function mentionedLeague(query) {
      for (const league of leagues) {
        const aliases = LEAGUE_ALIASES[league] || [league];
        if (aliases.some(alias => phraseIncluded(query, alias))) return league;
      }
      return null;
    }

    function mentionedDay(query) {
      const q = words(query);
      return DAY_NAMES.find(day => phraseIncluded(q, day)) || null;
    }

    function filtered(query) {
      const teamHits = mentionedTeams(query);
      const leagueHit = mentionedLeague(query);
      const dayHit = mentionedDay(query);
      return fixtures.filter(fixture => {
        const fixtureTeams = [fixture.home_team, fixture.away_team];
        if (teamHits.length >= 2 && !teamHits.slice(0, 2).every(team => fixtureTeams.includes(team))) return false;
        if (teamHits.length === 1 && !fixtureTeams.includes(teamHits[0])) return false;
        if (leagueHit && fixture.league_name !== leagueHit) return false;
        if (dayHit) {
          const day = new Intl.DateTimeFormat('en-US', {
            weekday: 'long', timeZone: 'America/New_York'
          }).format(new Date(fixture.kickoff_utc)).toLowerCase();
          if (day !== dayHit) return false;
        }
        return true;
      });
    }

    function filterLabel(query) {
      const parts = [];
      const teamHits = mentionedTeams(query);
      if (teamHits.length) parts.push(teamHits.slice(0, 2).join(' vs '));
      const leagueHit = mentionedLeague(query);
      if (leagueHit) parts.push(leagueHit);
      const dayHit = mentionedDay(query);
      if (dayHit) parts.push(DAY_LABELS[dayHit] || dayHit);
      return parts.length ? parts.join(' · ') : 'esta semana publicada';
    }

    function forecastLine(fixture) {
      const f = fixture.forecasts;
      return `${fixtureName(fixture)} — ${fixture.home_team} ${number(f.home_shots)} tiros / ${number(f.home_sot)} tiros a puerta; ` +
        `${fixture.away_team} ${number(f.away_shots)} tiros / ${number(f.away_sot)} tiros a puerta; ` +
        `combinado ${number(f.combined_shots)} tiros / ${number(f.combined_sot)} tiros a puerta.`;
    }

    function listMatches(rows) {
      if (!rows.length) return 'Ningún partido elegible publicado coincide con esa solicitud.';
      return rows.map((fixture, index) =>
        `${index + 1}. ${fixtureName(fixture)} — ${fixture.league_name}, ${shortDate(fixture.kickoff_utc)} a las ` +
        `${new Intl.DateTimeFormat('es-US', {hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(fixture.kickoff_utc))}`
      ).join('\n');
    }

    function teamSide(fixture, team) {
      if (team === fixture.home_team) return {
        role: 'home', position: fixture.home_position, form: fixture.home_form,
        averages: fixture.home_averages, components: fixture.home_components,
        shots: fixture.forecasts.home_shots, sot: fixture.forecasts.home_sot
      };
      if (team === fixture.away_team) return {
        role: 'away', position: fixture.away_position, form: fixture.away_form,
        averages: fixture.away_averages, components: fixture.away_components,
        shots: fixture.forecasts.away_shots, sot: fixture.forecasts.away_sot
      };
      return null;
    }

    function formLines(fixture, team) {
      const side = teamSide(fixture, team);
      if (!side) return '';
      const rows = side.form.map(row => {
        const players = (row.red_card_players || []).map(player => {
          if (!player?.player) return '';
          return player.team ? `${player.player} (${player.team})` : player.player;
        }).filter(Boolean);
        const cards = row.red_card
          ? `; tarjeta roja${players.length ? `: ${players.join(', ')}` : ''}${row.red_card_fallback ? '; usada para completar la muestra mínima' : ''}`
          : '';
        const venue = row.venue === 'H' ? 'local' : (row.venue === 'A' ? 'visitante' : row.venue);
        return `• ${row.date} ${venue} vs ${row.opponent} (posición ${row.opponent_position}), ${row.score}: ` +
          `T ${number(row.T)}, TA ${number(row.TA)}, TR ${number(row.TR)}, TAR ${number(row.TAR)}${cards}`;
      }).join('\n');
      return `${team}, muestra seleccionada de forma actual (${side.form.length}):\n${rows}\n` +
        `Promedios — T ${number(side.averages.T)}, TA ${number(side.averages.TA)}, ` +
        `TR ${number(side.averages.TR)}, TAR ${number(side.averages.TAR)}.`;
    }

    function h2hLines(fixture) {
      return `Cara a cara de ${fixture.previous_season_label}:\n` + fixture.h2h.map(row =>
        `• ${row.date}: ${row.fixture}, ${row.score}; ${fixture.home_team} T ${number(row.team_a_T)} / TA ${number(row.team_a_TA)}; ` +
        `${fixture.away_team} T ${number(row.team_b_T)} / TA ${number(row.team_b_TA)}${row.same_venue ? '; misma sede (T2/TA2)' : ''}`
      ).join('\n');
    }

    function componentLines(fixture) {
      const c = fixture.components;
      const home = fixture.home_components;
      const away = fixture.away_components;
      return `Componentes de la fórmula para ${fixtureName(fixture)}:\n` +
        `• Partido: T1 ${number(c.T1)}, T2 ${number(c.T2)}, T3 ${number(c.T3)} → ${number(fixture.forecasts.combined_shots)} tiros combinados\n` +
        `• Partido: TA1 ${number(c.TA1)}, TA2 ${number(c.TA2)}, TA3 ${number(c.TA3)} → ${number(fixture.forecasts.combined_sot)} tiros a puerta combinados\n` +
        `• ${fixture.home_team}: T/TA actuales ${number(home.current_form.T)}/${number(home.current_form.TA)}, ` +
        `misma sede ${number(home.same_venue_h2h.T)}/${number(home.same_venue_h2h.TA)}, ` +
        `promedio de dos cara a cara ${number(home.two_h2h_average.T)}/${number(home.two_h2h_average.TA)}\n` +
        `• ${fixture.away_team}: T/TA actuales ${number(away.current_form.T)}/${number(away.current_form.TA)}, ` +
        `misma sede ${number(away.same_venue_h2h.T)}/${number(away.same_venue_h2h.TA)}, ` +
        `promedio de dos cara a cara ${number(away.two_h2h_average.T)}/${number(away.two_h2h_average.TA)}.`;
    }

    function allData(fixture) {
      return `${forecastLine(fixture)}\n` +
        `Liga: ${fixture.league_name}. Inicio: ${dateTime(fixture.kickoff_utc)}. Corte de datos: ${dateTime(fixture.data_cutoff_et)}.\n` +
        `Posiciones: ${fixture.home_team} ${fixture.home_position}; ${fixture.away_team} ${fixture.away_position}.\n\n` +
        `${formLines(fixture, fixture.home_team)}\n\n${formLines(fixture, fixture.away_team)}\n\n` +
        `${h2hLines(fixture)}\n\n${componentLines(fixture)}`;
    }

    function redCards(rows) {
      const found = [];
      const matchIds = [];
      for (const fixture of rows) {
        for (const [team, sample] of [[fixture.home_team, fixture.home_form], [fixture.away_team, fixture.away_form]]) {
          for (const row of sample) {
            if (!row.red_card) continue;
            const names = (row.red_card_players || []).map(player => {
              if (!player?.player) return '';
              return player.team ? `${player.player} (${player.team})` : player.player;
            }).filter(Boolean).join(', ') || 'nombre del jugador no disponible';
            found.push(`${fixtureName(fixture)} — muestra de ${team}, ${row.date} vs ${row.opponent}: ${names}` +
              `${row.red_card_fallback ? ' (usado para completar la muestra mínima)' : ''}`);
            matchIds.push(String(fixture.match_id));
          }
        }
      }
      return {
        text: found.length ? `Filas con tarjeta roja en las muestras publicadas seleccionadas:\n${unique(found).map(x => `• ${x}`).join('\n')}` :
          'No aparecen filas con tarjeta roja en esas muestras publicadas seleccionadas.',
        matchIds: unique(matchIds)
      };
    }

    function playerRankingRequested(query) {
      const q = words(query);
      return /\b(top|highest|most|leading|leaders?|best)\b/.test(q) &&
        /\b(shots?|shooters?|sot|target)\b/.test(q) &&
        /\b(players?|shooters?|who)\b/.test(q);
    }

    function requestedTop(query) {
      const names = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
      const match = words(query).match(/\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/) ||
        words(query).match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+top\b/);
      const requested = match ? (Number(match[1]) || names[match[1]]) : 3;
      return Math.max(1, Math.min(requested || 3, 10));
    }

    function playerRankings(query) {
      if (!playerStats.length) {
        return {
          text:'Los totales de tiros por jugador todavía no están disponibles en este conjunto de datos publicado. Aparecerán después de la próxima actualización de datos exitosa.',
          matchIds:[]
        };
      }
      const q = words(query);
      const teamHits = mentionedTeams(query);
      const selected = playerStats
        .filter(team => teams.includes(team.team) && (!teamHits.length || teamHits.includes(team.team)))
        .slice()
        .sort((a, b) => String(a.team).localeCompare(String(b.team)));
      if (!selected.length) {
        return {text:'No hay totales de tiros por jugador disponibles para ese equipo del tablero.',matchIds:[]};
      }

      const asksSot = /\b(?:shots?|shooters?|players?) on target\b|\bsot\b/.test(q);
      const withoutSot = q.replace(/\b(?:shots?|shooters?|players?) on target\b|\bsot\b/g, ' ');
      const asksShots = /\b(shots?|shooters?)\b/.test(withoutSot) || !asksSot;
      const limit = requestedTop(query);

      function leaders(team, metric) {
        const other = metric === 'sot' ? 'shots' : 'sot';
        return (Array.isArray(team.players) ? team.players : []).slice().sort((a, b) =>
          Number(b[metric] || 0) - Number(a[metric] || 0) ||
          Number(b[other] || 0) - Number(a[other] || 0) ||
          String(a.player || '').localeCompare(String(b.player || '')) ||
          String(a.player_id || '').localeCompare(String(b.player_id || ''))
        ).slice(0, limit);
      }

      function rankingLine(label, rows, metric) {
        if (!rows.length) return `${label}: no hay tiradores registrados`;
        return `${label}: ` + rows.map((player, index) =>
          `${index + 1}. ${player.player} (${Number(player[metric] || 0)})`
        ).join(', ');
      }

      const sections = selected.map(team => {
        const rows = [];
        if (asksShots) rows.push(rankingLine('Tiros', leaders(team, 'shots'), 'shots'));
        if (asksSot) rows.push(rankingLine('Tiros a puerta', leaders(team, 'sot'), 'sot'));
        return `${team.team} (${Number(team.matches_counted || 0)} partidos contabilizados)\n` +
          rows.map(row => `• ${row}`).join('\n');
      });
      const season = payload?.player_stats?.season ? ` ${payload.player_stats.season}.` : '';
      const scope = payload?.player_stats?.scope || 'Tiros registrados en la temporada actual hasta el corte publicado.';
      const selectedNames = new Set(selected.map(team => team.team));
      const matchIds = fixtures.filter(fixture =>
        selectedNames.has(fixture.home_team) || selectedNames.has(fixture.away_team)
      ).map(fixture => String(fixture.match_id));
      return {
        text:`Los ${limit} mejores jugadores.${season}\n${scope}\n\n${sections.join('\n\n')}`,
        matchIds:unique(matchIds)
      };
    }

    function metricFor(query, teamMode = false) {
      const q = words(query);
      const isSot = /\b(sot|shots on target|shot on target)\b/.test(q);
      const combined = /\b(combined|total|match)\b/.test(q) || !teamMode;
      return {
        key: combined ? (isSot ? 'combined_sot' : 'combined_shots') : (isSot ? 'sot' : 'shots'),
        label: combined ? `${isSot ? 'tiros a puerta' : 'tiros'} combinados` : (isSot ? 'tiros a puerta' : 'tiros'),
        isSot, combined
      };
    }

    function ranked(query) {
      const rows = filtered(query);
      const teamMode = /\b(teams?|clubs?)\b/.test(words(query)) && !/\b(combined|total|match)\b/.test(words(query));
      const metric = metricFor(query, teamMode);
      let values;
      if (metric.combined) {
        values = rows.map(fixture => ({
          label: fixtureName(fixture), value: fixture.forecasts[metric.key], matchId: fixture.match_id
        }));
      } else {
        values = rows.flatMap(fixture => [
          {label: `${fixture.home_team} vs ${fixture.away_team}`, team: fixture.home_team, value: fixture.forecasts[`home_${metric.key}`], matchId: fixture.match_id},
          {label: `${fixture.away_team} vs ${fixture.home_team}`, team: fixture.away_team, value: fixture.forecasts[`away_${metric.key}`], matchId: fixture.match_id}
        ]);
      }
      const ascending = /\b(lowest|least|smallest|bottom|fewest)\b/.test(words(query));
      values.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);
      const numberNames = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
      const topMatch = words(query).match(/\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/) ||
        words(query).match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+top\b/);
      const requested = topMatch ? (Number(topMatch[1]) || numberNames[topMatch[1]]) : 1;
      const limit = Math.max(1, Math.min(requested, 10));
      const selected = values.slice(0, limit);
      if (!selected.length) return {text:'Ningún partido elegible publicado coincide con esa clasificación.',matchIds:[]};
      const direction = ascending ? 'Menor' : 'Mayor';
      return {
        text: `${direction} cantidad de ${metric.label} para ${filterLabel(query)}:\n` + selected.map((item, index) =>
          `${index + 1}. ${item.team ? `${item.team} — ${item.label}` : item.label}: ${number(item.value)}`
        ).join('\n'),
        matchIds: selected.map(x => String(x.matchId))
      };
    }

    function threshold(query) {
      const q = words(query);
      const match = q.match(/\b(over|above|more than|at least|under|below|less than|at most)\s+(\d+(?:\.\d+)?)\b/);
      if (!match) return null;
      const limit = Number(match[2]);
      const lower = ['under','below','less than','at most'].includes(match[1]);
      const inclusive = ['at least','at most'].includes(match[1]);
      const metric = metricFor(query, false);
      const rows = filtered(query).filter(fixture => {
        const value = Number(fixture.forecasts[metric.key]);
        return lower ? (inclusive ? value <= limit : value < limit) : (inclusive ? value >= limit : value > limit);
      });
      const operator = {
        over:'más de', above:'por encima de', 'more than':'más de', 'at least':'al menos',
        under:'menos de', below:'por debajo de', 'less than':'menos de', 'at most':'como máximo'
      }[match[1]] || match[1];
      return {
        text: rows.length
          ? `${rows.length} partido${rows.length === 1 ? '' : 's'} con ${metric.label} ${operator} ${limit}:\n` +
            rows.map(f => `• ${fixtureName(f)} — ${number(f.forecasts[metric.key])}`).join('\n')
          : `Ningún partido elegible publicado tiene ${metric.label} ${operator} ${limit}.`,
        matchIds: rows.map(f => String(f.match_id))
      };
    }

    function rawSearch(query) {
      const tokens = unique(words(query).split(' ').filter(token => token.length >= 3 && !STOP_WORDS.has(token)));
      if (!tokens.length) return [];
      return fixtures.map(fixture => {
        const haystack = words(JSON.stringify(fixture));
        const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        return {fixture, score};
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    }

    function help() {
      return 'Respondo usando todos los campos de las hojas elegibles publicadas. Prueba:\n' +
        '• Muestra todos los partidos, equipos, partidos de La Liga o partidos del domingo\n' +
        '• ¿Cuál es el pronóstico de Villarreal vs Real Betis?\n' +
        '• Muestra todos los datos, la forma, el cara a cara, las posiciones o los componentes de la fórmula de un partido\n' +
        '• ¿Qué partido tiene más tiros combinados?\n' +
        '• Los 3 mejores equipos por tiros a puerta\n' +
        '• Los 3 mejores tiradores y líderes en tiros a puerta de cada equipo\n' +
        '• Muestra partidos con más de 25 tiros combinados\n' +
        '• Muestra partidos con tarjetas rojas\n' +
        'El asistente usa únicamente el tablero publicado; los partidos omitidos y la auditoría privada no están disponibles aquí.';
    }

    function normalizedCommand(query) {
      return words(query)
        .replace(/^(?:please\s+|can you\s+|could you\s+|would you\s+)+/, '')
        .replace(/\s+please$/, '')
        .trim();
    }

    function refreshCommand(query) {
      const command = normalizedCommand(query);
      return /^(?:refresh|rerun)(?: (?:the )?(?:data|dataset|dashboard|formula|page|it))?(?: now)?$/.test(command) ||
        /^run (?:a |the )?(?:data |dashboard )?refresh(?: now)?$/.test(command) ||
        /^update (?:the )?(?:data|dataset|dashboard)(?: now)?$/.test(command);
    }

    function checkCommand(query) {
      const command = normalizedCommand(query);
      return /^(?:check for (?:updated|new|latest) data|check (?:the )?(?:page|dashboard|data)|reload (?:the )?(?:page|dashboard)|update the page)$/.test(command);
    }

    function unknownTeamFilter(query, teamHits) {
      if (teamHits.length || mentionedLeague(query) || mentionedDay(query)) return null;
      const q = words(query);
      const patterns = [
        /^(?:show|list|find)(?: me)? (.+?) (?:matches|fixtures|games)$/,
        /^(?:show|list|find)(?: me)? (?:los )?(?:matches|fixtures|games)(?: for| of| de| del) (.+)$/,
        /^how many (.+?) (?:matches|fixtures|games)(?: are there)?$/,
        /^(?:are there|any) (.+?) (?:matches|fixtures|games)$/
      ];
      for (const pattern of patterns) {
        const match = q.match(pattern);
        if (!match) continue;
        const candidate = match[1].replace(/\b(?:all|eligible|published|upcoming|weekly|this week|los|las|del|de)\b/g, '').trim();
        if (candidate && !/^(?:the|there)$/.test(candidate)) return candidate;
      }
      return null;
    }

    function answer(query) {
      query = intentWords(query);
      const q = words(query);
      if (!q) return {text:'Escribe una pregunta sobre los datos publicados del tablero.',matchIds:[]};
      if (/\b(help|examples|commands|what can you do)\b/.test(q)) return {text:help(),matchIds:[]};
      if (refreshCommand(query)) return {text:'',matchIds:[],action:'refresh'};
      if (checkCommand(query)) return {text:'',matchIds:[],action:'check'};
      if (!loaded) return {text:'Los datos publicados del tablero todavía no se han cargado. Inténtalo de nuevo en un momento.',matchIds:[]};

      if (/\b(cutoff|last updated|last refreshed|data date|when.*updated|when.*refreshed)\b/.test(q)) {
        const cutoffs = unique(fixtures.map(f => f.data_cutoff_et)).sort();
        const values = cutoffs.length ? cutoffs : [payload?.generated_at_utc].filter(Boolean);
        return {text:values.length ? `Corte de datos publicado: ${values.map(dateTime).join(', ')}.` : 'El conjunto de datos publicado es válido, pero no tiene partidos elegibles esta semana.',matchIds:[]};
      }

      if (!fixtures.length) return {text:'Actualmente ningún próximo partido cumple todas las reglas de esta semana publicada.',matchIds:[]};

      if (playerRankingRequested(query)) return playerRankings(query);

      const rows = filtered(query);
      const teamHits = mentionedTeams(query);
      const unknownTeam = unknownTeamFilter(query, teamHits);
      if (unknownTeam) {
        return {text:`“${unknownTeam}” no aparece como equipo en las hojas elegibles publicadas.`,matchIds:[]};
      }
      if (teamHits.length && !rows.length) {
        return {text:`Ningún partido elegible publicado contiene juntos a ${teamHits.slice(0, 2).join(' y ')}.`,matchIds:[]};
      }

      if (/\b(red card|red cards|sending off|sent off)\b/.test(q)) {
        return redCards(rows);
      }

      const thresholdResult = threshold(query);
      if (thresholdResult) return thresholdResult;

      if (/\b(highest|most|largest|top|lowest|least|smallest|bottom|fewest)\b/.test(q) &&
          /\b(shots|shot|sot|target)\b/.test(q)) return ranked(query);

      if (/\bhow many|count|number of\b/.test(q) && /\b(teams|clubs|leagues|matches|fixtures|games)\b/.test(q)) {
        if (/\bteams|clubs\b/.test(q)) {
          const selectedTeams = unique(rows.flatMap(f => [f.home_team, f.away_team]));
          return {text:`Aparecen ${selectedTeams.length} equipos en ${filterLabel(query)}.`,matchIds:rows.map(f => String(f.match_id))};
        }
        if (/\bleagues\b/.test(q)) return {text:`Aparecen ${unique(rows.map(f => f.league_name)).length} ligas en ${filterLabel(query)}.`,matchIds:[]};
        return {text:`${rows.length} partido${rows.length === 1 ? '' : 's'} elegible${rows.length === 1 ? '' : 's'} publicado${rows.length === 1 ? '' : 's'} coincide${rows.length === 1 ? '' : 'n'} con ${filterLabel(query)}.`,matchIds:rows.map(f => String(f.match_id))};
      }

      if (/\b(all data|everything|full details|complete details)\b/.test(q)) {
        return {text:rows.map(allData).join('\n\n──────────\n\n'),matchIds:rows.map(f => String(f.match_id))};
      }

      const asksSpecific = teamHits.length > 0;
      if (asksSpecific && rows.length) {
        const exactFixture = teamHits.length >= 2 || rows.length === 1;
        const selectedRows = exactFixture ? [rows[0]] : rows;
        const fixture = selectedRows[0];
        const selectedTeam = teamHits.length === 1 ? teamHits[0] : null;
        if (/\b(h2h|head to head|previous season)\b/.test(q)) {
          return {text:selectedRows.map(h2hLines).join('\n\n'),matchIds:selectedRows.map(f => String(f.match_id))};
        }
        if (/\b(form|recent|sample|last games|averages|average|received|\bt\b|\bta\b|\btr\b|\btar\b)\b/.test(q)) {
          const targetTeams = selectedTeam ? [selectedTeam] : [fixture.home_team, fixture.away_team];
          return {text:targetTeams.map(team => formLines(fixture, team)).join('\n\n'),matchIds:[String(fixture.match_id)]};
        }
        if (/\b(formula|component|\bt1\b|\bt2\b|\bt3\b|\bta1\b|\bta2\b|\bta3\b)\b/.test(q)) {
          return {text:selectedRows.map(componentLines).join('\n\n'),matchIds:selectedRows.map(f => String(f.match_id))};
        }
        if (/\b(position|positions|standing|standings|rank)\b/.test(q)) {
          const positionLines = selectedRows.map(item => `• ${item.home_team} ${item.home_position}; ${item.away_team} ${item.away_position}`);
          return {text:`Posiciones en el corte de datos:\n${unique(positionLines).join('\n')}`,matchIds:selectedRows.map(f => String(f.match_id))};
        }
        if (/\b(kickoff|date|time|when)\b/.test(q)) {
          return {text:selectedRows.map(item => `${fixtureName(item)} comienza el ${dateTime(item.kickoff_utc)}.`).join('\n'),matchIds:selectedRows.map(f => String(f.match_id))};
        }
        if (/\bleague\b/.test(q)) {
          return {text:selectedRows.map(item => `${fixtureName(item)} pertenece a ${item.league_name}.`).join('\n'),matchIds:selectedRows.map(f => String(f.match_id))};
        }
        return {text:selectedRows.map(forecastLine).join('\n'),matchIds:selectedRows.map(f => String(f.match_id))};
      }

      if (/\b(teams|clubs)\b/.test(q) && /\b(show|list|all)\b/.test(q)) {
        const selectedTeams = unique(rows.flatMap(f => [f.home_team, f.away_team])).sort();
        return {text:`Equipos en ${filterLabel(query)} (${selectedTeams.length}):\n${selectedTeams.join(', ')}`,matchIds:rows.map(f => String(f.match_id))};
      }

      if (/\b(matches|fixtures|games|schedule)\b/.test(q) || mentionedLeague(query) || mentionedDay(query)) {
        return {text:`Partidos elegibles publicados para ${filterLabel(query)} (${rows.length}):\n${listMatches(rows)}`,matchIds:rows.map(f => String(f.match_id))};
      }

      const searchHits = rawSearch(query);
      if (searchHits.length) {
        const best = searchHits.slice(0, 5).map(x => x.fixture);
        return {
          text:`Encontré esas palabras en ${best.length} hoja${best.length === 1 ? '' : 's'} publicada${best.length === 1 ? '' : 's'}:\n${best.map(f => `• ${forecastLine(f)}`).join('\n')}\n\nPide “todos los datos” con los nombres de ambos equipos para ver un resumen completo de la hoja.`,
          matchIds:best.map(f => String(f.match_id))
        };
      }

      return {text:`No pude relacionar esa pregunta con los datos de las hojas publicadas.\n\n${help()}`,matchIds:[]};
    }

    return {answer, fixtures, teams, leagues, loaded};
  }

  return {createEngine, words};
});
