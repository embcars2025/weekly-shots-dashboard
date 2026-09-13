(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DashboardChatEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOP_WORDS = new Set([
    'a','about','all','and','are','can','data','do','for','from','give','has','have','i','in','is',
    'match','matches','me','of','on','please','show','tell','the','this','to','what','which','with'
  ]);

  const LEAGUE_ALIASES = {
    'Premier League': ['premier league', 'epl', 'english league'],
    'La Liga': ['la liga', 'laliga', 'spanish league'],
    'Ligue 1': ['ligue 1', 'ligue one', 'french league'],
    'Serie A': ['serie a', 'italian league']
  };

  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  function words(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
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
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : 'unavailable';
  }

  function dateTime(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value ?? 'unavailable');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short'
    }).format(parsed);
  }

  function shortDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value ?? 'unavailable');
    return new Intl.DateTimeFormat('en-US', {
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
      if (dayHit) parts.push(dayHit[0].toUpperCase() + dayHit.slice(1));
      return parts.length ? parts.join(' · ') : 'this published week';
    }

    function forecastLine(fixture) {
      const f = fixture.forecasts;
      return `${fixtureName(fixture)} — ${fixture.home_team} ${number(f.home_shots)} shots / ${number(f.home_sot)} SOT; ` +
        `${fixture.away_team} ${number(f.away_shots)} shots / ${number(f.away_sot)} SOT; ` +
        `combined ${number(f.combined_shots)} shots / ${number(f.combined_sot)} SOT.`;
    }

    function listMatches(rows) {
      if (!rows.length) return 'No published eligible matches fit that request.';
      return rows.map((fixture, index) =>
        `${index + 1}. ${fixtureName(fixture)} — ${fixture.league_name}, ${shortDate(fixture.kickoff_utc)} at ` +
        `${new Intl.DateTimeFormat('en-US', {hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(fixture.kickoff_utc))}`
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
          ? `; red card${players.length ? `: ${players.join(', ')}` : ''}${row.red_card_fallback ? '; minimum-sample fallback' : ''}`
          : '';
        return `• ${row.date} ${row.venue} vs ${row.opponent} (position ${row.opponent_position}), ${row.score}: ` +
          `T ${number(row.T)}, TA ${number(row.TA)}, TR ${number(row.TR)}, TAR ${number(row.TAR)}${cards}`;
      }).join('\n');
      return `${team} selected current-form sample (${side.form.length}):\n${rows}\n` +
        `Averages — T ${number(side.averages.T)}, TA ${number(side.averages.TA)}, ` +
        `TR ${number(side.averages.TR)}, TAR ${number(side.averages.TAR)}.`;
    }

    function h2hLines(fixture) {
      return `${fixture.previous_season_label} head-to-head:\n` + fixture.h2h.map(row =>
        `• ${row.date}: ${row.fixture}, ${row.score}; ${fixture.home_team} T ${number(row.team_a_T)} / TA ${number(row.team_a_TA)}; ` +
        `${fixture.away_team} T ${number(row.team_b_T)} / TA ${number(row.team_b_TA)}${row.same_venue ? '; same venue (T2/TA2)' : ''}`
      ).join('\n');
    }

    function componentLines(fixture) {
      const c = fixture.components;
      const home = fixture.home_components;
      const away = fixture.away_components;
      return `Formula components for ${fixtureName(fixture)}:\n` +
        `• Match: T1 ${number(c.T1)}, T2 ${number(c.T2)}, T3 ${number(c.T3)} → ${number(fixture.forecasts.combined_shots)} combined shots\n` +
        `• Match: TA1 ${number(c.TA1)}, TA2 ${number(c.TA2)}, TA3 ${number(c.TA3)} → ${number(fixture.forecasts.combined_sot)} combined SOT\n` +
        `• ${fixture.home_team}: current T/TA ${number(home.current_form.T)}/${number(home.current_form.TA)}, ` +
        `same-venue ${number(home.same_venue_h2h.T)}/${number(home.same_venue_h2h.TA)}, ` +
        `two-H2H average ${number(home.two_h2h_average.T)}/${number(home.two_h2h_average.TA)}\n` +
        `• ${fixture.away_team}: current T/TA ${number(away.current_form.T)}/${number(away.current_form.TA)}, ` +
        `same-venue ${number(away.same_venue_h2h.T)}/${number(away.same_venue_h2h.TA)}, ` +
        `two-H2H average ${number(away.two_h2h_average.T)}/${number(away.two_h2h_average.TA)}.`;
    }

    function allData(fixture) {
      return `${forecastLine(fixture)}\n` +
        `League: ${fixture.league_name}. Kickoff: ${dateTime(fixture.kickoff_utc)}. Data cutoff: ${dateTime(fixture.data_cutoff_et)}.\n` +
        `Positions: ${fixture.home_team} ${fixture.home_position}; ${fixture.away_team} ${fixture.away_position}.\n\n` +
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
            }).filter(Boolean).join(', ') || 'player name unavailable';
            found.push(`${fixtureName(fixture)} — ${team} sample, ${row.date} vs ${row.opponent}: ${names}` +
              `${row.red_card_fallback ? ' (used to reach the minimum sample)' : ''}`);
            matchIds.push(String(fixture.match_id));
          }
        }
      }
      return {
        text: found.length ? `Red-card rows in the selected published samples:\n${unique(found).map(x => `• ${x}`).join('\n')}` :
          'No red-card rows appear in those published selected samples.',
        matchIds: unique(matchIds)
      };
    }

    function metricFor(query, teamMode = false) {
      const q = words(query);
      const isSot = /\b(sot|shots on target|shot on target)\b/.test(q);
      const combined = /\b(combined|total|match)\b/.test(q) || !teamMode;
      return {
        key: combined ? (isSot ? 'combined_sot' : 'combined_shots') : (isSot ? 'sot' : 'shots'),
        label: combined ? `combined ${isSot ? 'SOT' : 'shots'}` : (isSot ? 'SOT' : 'shots'),
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
      const requested = Number((words(query).match(/\btop\s+(\d+)\b/) || [])[1] || 1);
      const limit = Math.max(1, Math.min(requested, 10));
      const selected = values.slice(0, limit);
      if (!selected.length) return {text:'No published eligible matches fit that ranking.',matchIds:[]};
      const direction = ascending ? 'Lowest' : 'Highest';
      return {
        text: `${direction} ${metric.label} for ${filterLabel(query)}:\n` + selected.map((item, index) =>
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
      return {
        text: rows.length
          ? `${rows.length} match${rows.length === 1 ? '' : 'es'} with ${metric.label} ${match[1]} ${limit}:\n` +
            rows.map(f => `• ${fixtureName(f)} — ${number(f.forecasts[metric.key])}`).join('\n')
          : `No published eligible matches have ${metric.label} ${match[1]} ${limit}.`,
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
      return 'I answer from every field in the published eligible worksheets. Try:\n' +
        '• Show all matches, teams, La Liga matches, or Sunday matches\n' +
        '• What is Villarreal vs Real Betis forecast?\n' +
        '• Show all data, form, H2H, positions, or formula components for a match\n' +
        '• Which match has the highest combined shots?\n' +
        '• Top 3 teams by SOT\n' +
        '• Show matches with combined shots over 25\n' +
        '• Show matches with red cards\n' +
        'The assistant uses the published dashboard only, so omitted fixtures and the private audit are not available here.';
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
        /^how many (.+?) (?:matches|fixtures|games)(?: are there)?$/,
        /^(?:are there|any) (.+?) (?:matches|fixtures|games)$/
      ];
      for (const pattern of patterns) {
        const match = q.match(pattern);
        if (!match) continue;
        const candidate = match[1].replace(/\b(?:all|eligible|published|upcoming|weekly|this week)\b/g, '').trim();
        if (candidate && !/^(?:the|there)$/.test(candidate)) return candidate;
      }
      return null;
    }

    function answer(query) {
      const q = words(query);
      if (!q) return {text:'Type a question about the published dashboard data.',matchIds:[]};
      if (/\b(help|examples|commands|what can you do)\b/.test(q)) return {text:help(),matchIds:[]};
      if (refreshCommand(query)) return {text:'',matchIds:[],action:'refresh'};
      if (checkCommand(query)) return {text:'',matchIds:[],action:'check'};
      if (!loaded) return {text:'The published dashboard data has not loaded yet. Please try again in a moment.',matchIds:[]};

      if (/\b(cutoff|last updated|last refreshed|data date|when.*updated|when.*refreshed)\b/.test(q)) {
        const cutoffs = unique(fixtures.map(f => f.data_cutoff_et)).sort();
        const values = cutoffs.length ? cutoffs : [payload?.generated_at_utc].filter(Boolean);
        return {text:values.length ? `Published data cutoff: ${values.map(dateTime).join(', ')}.` : 'The published dataset is valid but has no eligible fixtures this week.',matchIds:[]};
      }

      if (!fixtures.length) return {text:'No upcoming matches currently meet every rule for this published week.',matchIds:[]};

      const rows = filtered(query);
      const teamHits = mentionedTeams(query);
      const unknownTeam = unknownTeamFilter(query, teamHits);
      if (unknownTeam) {
        return {text:`“${unknownTeam}” does not appear as a team in the published eligible worksheets.`,matchIds:[]};
      }
      if (teamHits.length && !rows.length) {
        return {text:`No published eligible match contains ${teamHits.slice(0, 2).join(' and ')} together.`,matchIds:[]};
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
          return {text:`${selectedTeams.length} teams appear in ${filterLabel(query)}.`,matchIds:rows.map(f => String(f.match_id))};
        }
        if (/\bleagues\b/.test(q)) return {text:`${unique(rows.map(f => f.league_name)).length} leagues appear in ${filterLabel(query)}.`,matchIds:[]};
        return {text:`${rows.length} published eligible match${rows.length === 1 ? '' : 'es'} fit ${filterLabel(query)}.`,matchIds:rows.map(f => String(f.match_id))};
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
          return {text:`Positions at the data cutoff:\n${unique(positionLines).join('\n')}`,matchIds:selectedRows.map(f => String(f.match_id))};
        }
        if (/\b(kickoff|date|time|when)\b/.test(q)) {
          return {text:selectedRows.map(item => `${fixtureName(item)} kicks off ${dateTime(item.kickoff_utc)}.`).join('\n'),matchIds:selectedRows.map(f => String(f.match_id))};
        }
        if (/\bleague\b/.test(q)) {
          return {text:selectedRows.map(item => `${fixtureName(item)} is in ${item.league_name}.`).join('\n'),matchIds:selectedRows.map(f => String(f.match_id))};
        }
        return {text:selectedRows.map(forecastLine).join('\n'),matchIds:selectedRows.map(f => String(f.match_id))};
      }

      if (/\b(teams|clubs)\b/.test(q) && /\b(show|list|all)\b/.test(q)) {
        const selectedTeams = unique(rows.flatMap(f => [f.home_team, f.away_team])).sort();
        return {text:`Teams in ${filterLabel(query)} (${selectedTeams.length}):\n${selectedTeams.join(', ')}`,matchIds:rows.map(f => String(f.match_id))};
      }

      if (/\b(matches|fixtures|games|schedule)\b/.test(q) || mentionedLeague(query) || mentionedDay(query)) {
        return {text:`Published eligible matches for ${filterLabel(query)} (${rows.length}):\n${listMatches(rows)}`,matchIds:rows.map(f => String(f.match_id))};
      }

      const searchHits = rawSearch(query);
      if (searchHits.length) {
        const best = searchHits.slice(0, 5).map(x => x.fixture);
        return {
          text:`I found this wording in ${best.length} published worksheet${best.length === 1 ? '' : 's'}:\n${best.map(f => `• ${forecastLine(f)}`).join('\n')}\n\nAsk for “all data” with both team names to see a complete worksheet summary.`,
          matchIds:best.map(f => String(f.match_id))
        };
      }

      return {text:`I could not map that wording to the published worksheet data.\n\n${help()}`,matchIds:[]};
    }

    return {answer, fixtures, teams, leagues, loaded};
  }

  return {createEngine, words};
});
