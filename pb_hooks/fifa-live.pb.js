/// <reference path="../pb_data/types.d.ts" />

// Public server-side live-score proxy. It keeps optional provider credentials
// out of the browser and lets the edge cache the response for one minute.
routerAdd("GET", "/api/fifa/live-scores", function (e) {
  var out = []
  var source = "none"

  var pushEspn = function(events) {
    for (var i = 0; i < events.length; i++) {
      var raw = events[i] || {}
      var comps = raw.competitions || []
      var comp = comps.length ? comps[0] : null
      if (!comp) continue
      var competitors = comp.competitors || []
      var home = null, away = null
      for (var c = 0; c < competitors.length; c++) {
        if (competitors[c].homeAway === "home") home = competitors[c]
        if (competitors[c].homeAway === "away") away = competitors[c]
      }
      if (!home || !away) continue
      var state = comp.status && comp.status.type ? String(comp.status.type.state || "pre") : "pre"
      var status = state === "in" ? "IN_PLAY" : state === "post" ? "FINISHED" : "SCHEDULED"
      var ht = home.team || {}, at = away.team || {}
      var hg = home.score === "" || home.score == null ? null : Number(home.score)
      var ag = away.score === "" || away.score == null ? null : Number(away.score)
      out.push({
        id: String(raw.id || ""),
        homeTeam: String(ht.displayName || ht.name || ht.abbreviation || ""),
        awayTeam: String(at.displayName || at.name || at.abbreviation || ""),
        homeGoals: status === "SCHEDULED" ? null : hg,
        awayGoals: status === "SCHEDULED" ? null : ag,
        status: status,
        minute: comp.status && typeof comp.status.clock === "number" ? Math.floor(comp.status.clock / 60) : null,
        kickoffAt: String(raw.date || comp.date || "") || null,
        stage: null,
      })
    }
  }

  try {
    var espn = $http.send({
      url: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
      method: "GET",
      headers: { "Accept": "application/json" },
      timeout: 8,
    })
    if (espn.statusCode === 200 && espn.json && espn.json.events) {
      pushEspn(espn.json.events)
      if (out.length) source = "espn"
    }
  } catch (_) {}

  if (!out.length) {
    var token = $os.getenv("FOOTBALL_DATA_API_TOKEN")
    if (token) {
      try {
        var fd = $http.send({
          url: "https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED",
          method: "GET",
          headers: { "X-Auth-Token": token, "Accept": "application/json" },
          timeout: 8,
        })
        var rows = fd.statusCode === 200 && fd.json ? (fd.json.matches || []) : []
        for (var f = 0; f < rows.length; f++) {
          var r = rows[f], score = r.score || {}, full = score.fullTime || {}, half = score.halfTime || {}
          var statusFd = String(r.status || "UNKNOWN")
          var fh = full.home == null ? half.home : full.home
          var fa = full.away == null ? half.away : full.away
          out.push({
            id: String(r.id || ""),
            homeTeam: String((r.homeTeam || {}).shortName || (r.homeTeam || {}).name || ""),
            awayTeam: String((r.awayTeam || {}).shortName || (r.awayTeam || {}).name || ""),
            homeGoals: statusFd === "SCHEDULED" ? null : (fh == null ? null : Number(fh)),
            awayGoals: statusFd === "SCHEDULED" ? null : (fa == null ? null : Number(fa)),
            status: statusFd,
            minute: r.minute == null ? null : Number(r.minute),
            kickoffAt: String(r.utcDate || "") || null,
            stage: String(r.stage || r.group || "") || null,
          })
        }
        if (out.length) source = "football-data"
      } catch (_) {}
    }
  }

  // Static no-secret fallback. It is not real-time, but prevents a provider
  // outage from breaking the match UI entirely.
  if (!out.length) {
    try {
      var of = $http.send({
        url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
        method: "GET",
        headers: { "Accept": "application/json" },
        timeout: 8,
      })
      var fixtures = of.statusCode === 200 && of.json ? (of.json.matches || []) : []
      for (var o = 0; o < fixtures.length; o++) {
        var m = fixtures[o], sc = m.score || {}, ft = sc.ft || [0, 0], played = !!sc.ft
        var date = String(m.date || ""), tm = String(m.time || "").replace(/\s*UTC.*$/i, "").trim()
        out.push({
          id: String(m.num || (String(m.team1 || "") + "-" + String(m.team2 || "") + "-" + date)),
          homeTeam: String(m.team1 || ""),
          awayTeam: String(m.team2 || ""),
          homeGoals: played ? Number(ft[0] || 0) : null,
          awayGoals: played ? Number(ft[1] || 0) : null,
          status: played ? "FINISHED" : "SCHEDULED",
          minute: null,
          kickoffAt: date ? date + "T" + (tm || "12:00") + ":00Z" : null,
          stage: String(m.round || "") || null,
        })
      }
      if (out.length) source = "openfootball"
    } catch (_) {}
  }

  e.response.header().set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120")
  return e.json(200, { matches: out, configured: out.length > 0, source: source, fetchedAt: Date.now() })
})
