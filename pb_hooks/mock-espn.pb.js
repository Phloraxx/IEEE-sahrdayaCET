/**
 * Mock ESPN scoreboard for FIFA test matches (external_ids.mock === true).
 * GET /api/fifa/mock-espn/scoreboard — public, returns site.api.espn.com shape.
 */

var _mockParseJson = function (raw) {
    if (!raw) return null
    if (typeof raw === "string") { try { return JSON.parse(raw) } catch (ex) { return null } }
    if (typeof raw === "object") return raw
    return null
}

var _mockResolvePhase = function (kickoffAt, endAt, nowMs) {
    var kickoff = new Date(kickoffAt).getTime()
    var end = new Date(endAt).getTime()
    if (isNaN(kickoff) || isNaN(end)) return "pre"
    if (nowMs < kickoff) return "pre"
    if (nowMs >= end) return "post"
    return "in"
}

var _mockResolveMinute = function (kickoffAt, endAt, nowMs) {
    var phase = _mockResolvePhase(kickoffAt, endAt, nowMs)
    if (phase !== "in") return null
    var kickoff = new Date(kickoffAt).getTime()
    var end = new Date(endAt).getTime()
    var elapsed = nowMs - kickoff
    var total = end - kickoff
    if (total <= 0) return 0
    var ratio = elapsed / total
    if (ratio < 0) ratio = 0
    if (ratio > 1) ratio = 1
    var min = Math.floor(ratio * 90) + 1
    return min > 95 ? 95 : min
}

var _mockBuildRawEvent = function (rec, cfg, nowMs) {
    var phase = _mockResolvePhase(cfg.kickoff_at, cfg.end_at, nowMs)
    var minute = _mockResolveMinute(cfg.kickoff_at, cfg.end_at, nowMs)
    var state = phase === "pre" ? "pre" : (phase === "in" ? "in" : "post")
    var statusName = "STATUS_SCHEDULED"
    if (phase === "post") statusName = "STATUS_FULL_TIME"
    else if (phase === "in" && minute !== null && minute > 45) statusName = "STATUS_SECOND_HALF"
    else if (phase === "in") statusName = "STATUS_FIRST_HALF"

    var homeGoals = cfg.home_goals
    var awayGoals = cfg.away_goals
    if (phase === "in") {
        homeGoals = cfg.live_home_goals !== undefined && cfg.live_home_goals !== null ? cfg.live_home_goals : cfg.home_goals
        awayGoals = cfg.live_away_goals !== undefined && cfg.live_away_goals !== null ? cfg.live_away_goals : cfg.away_goals
    }

    var ext = _mockParseJson(rec.get("external_ids")) || {}
    var espnId = ext.espn ? String(ext.espn) : ("mock-" + rec.id)
    var home = rec.getString("team_home") || "Home"
    var away = rec.getString("team_away") || "Away"
    var homeWon = phase === "post" && Number(homeGoals) > Number(awayGoals)
    var awayWon = phase === "post" && Number(awayGoals) > Number(homeGoals)

    var compStatus = { type: { state: state, name: statusName } }
    if (phase === "in" && minute !== null) compStatus.clock = minute * 60

    var homeComp = { homeAway: "home", team: { displayName: home, name: home } }
    var awayComp = { homeAway: "away", team: { displayName: away, name: away } }
    if (phase !== "pre") {
        homeComp.score = String(homeGoals)
        awayComp.score = String(awayGoals)
    }
    if (phase === "post") {
        homeComp.winner = homeWon
        awayComp.winner = awayWon
    }

    return {
        id: espnId,
        date: cfg.kickoff_at,
        status: { type: { state: state, name: statusName } },
        competitions: [{ date: cfg.kickoff_at, status: compStatus, competitors: [homeComp, awayComp] }],
    }
}

var _mockLoadScoreboard = function () {
    var events = []
    var nowMs = Date.now()
    try {
        var records = $app.findRecordsByFilter("fifa_matches", "1 = 1", "kickoff_at", 500, 0, {})
        for (var i = 0; i < records.length; i++) {
            var rec = records[i]
            var ext = _mockParseJson(rec.get("external_ids")) || {}
            if (!ext.mock) continue
            var cfg = ext.mock_config
            if (!cfg || !cfg.kickoff_at || !cfg.end_at) continue
            events.push(_mockBuildRawEvent(rec, cfg, nowMs))
        }
    } catch (ex) {
        console.log("[fifa] mock-espn: load failed: " + ex)
    }
    return events
}

routerAdd("GET", "/api/fifa/mock-espn/scoreboard", function (e) {
    return e.json(200, { events: _mockLoadScoreboard() })
})