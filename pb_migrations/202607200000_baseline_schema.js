/// <reference path="../pb_data/types.d.ts" />

// Complete additive baseline for a fresh IEEE deployment.
// Existing production collections are never dropped or recreated; this file
// only creates collections that don't already exist. Incremental migrations
// that follow remain authoritative for later rule/index changes.

function findCollection(app, name) {
  try { return app.findCollectionByNameOrId(name) } catch (_) { return null }
}

function createIfMissing(app, config) {
  var existing = findCollection(app, config.name)
  if (existing) return existing
  var collection = new Collection(config)
  app.save(collection)
  return collection
}

migrate((app) => {
  // ── Auth users ────────────────────────────────────────────────────
  var users = createIfMissing(app, {
    type: "auth",
    name: "users",
    listRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    createRule: '@request.context = "oauth2"',
    updateRule: '(id = @request.auth.id && @request.body.role:changed = false && @request.body.balance:changed = false && @request.body.display_name:changed = false && @request.body.name:changed = false) || (@request.auth.role = "admin" && @request.body.balance:changed = false && @request.body.role:changed = false)',
    deleteRule: null,
    fields: [
      { type: "text", name: "name", max: 150 },
      { type: "file", name: "avatar", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
      { type: "select", name: "role", values: ["user", "chair", "content", "admin"], maxSelect: 1 },
      { type: "text", name: "display_name", max: 150 },
      { type: "number", name: "balance", min: 0 },
    ],
    passwordAuth: { enabled: false },
    indexes: [
      'CREATE UNIQUE INDEX idx_users_display_name ON users (display_name) WHERE display_name != ""',
      'CREATE INDEX idx_users_role ON users (role)',
    ],
  })

  // PocketBase ships a default `users` auth collection on a fresh install.
  // createIfMissing() intentionally preserves it, so ensure our application
  // fields/rules are present whether this is a new or existing deployment.
  if (!users.fields.getByName("role")) {
    users.fields.add(new SelectField({
      name: "role",
      values: ["user", "chair", "content", "admin"],
      maxSelect: 1,
    }))
  }
  if (!users.fields.getByName("display_name")) {
    users.fields.add(new TextField({ name: "display_name", max: 150 }))
  }
  if (!users.fields.getByName("balance")) {
    users.fields.add(new NumberField({ name: "balance", min: 0 }))
  }
  users.listRule = 'id = @request.auth.id || @request.auth.role = "admin"'
  users.viewRule = users.listRule
  users.createRule = '@request.context = "oauth2"'
  users.updateRule = '(id = @request.auth.id && @request.body.role:changed = false && @request.body.balance:changed = false && @request.body.display_name:changed = false && @request.body.name:changed = false) || (@request.auth.role = "admin" && @request.body.balance:changed = false && @request.body.role:changed = false)'
  users.deleteRule = null
  users.passwordAuth.enabled = false
  users.oauth2.enabled = true
  users.addIndex("idx_users_display_name", true, "display_name", "display_name != ''")
  users.addIndex("idx_users_role", false, "role", "")
  app.save(users)

  // ── Core website ──────────────────────────────────────────────────
  var societies = createIfMissing(app, {
    type: "base",
    name: "societies",
    listRule: 'isHidden = false || @request.auth.role = "admin" || chairs.id ?= @request.auth.id',
    viewRule: 'isHidden = false || @request.auth.role = "admin" || chairs.id ?= @request.auth.id',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin" || (chairs.id ?= @request.auth.id && @request.body.chairs:changed = false)',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "text", name: "name", required: true, max: 160 },
      { type: "text", name: "slug", required: true, max: 100 },
      { type: "editor", name: "bio" },
      { type: "file", name: "logo", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"] },
      { type: "file", name: "banner", maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
      { type: "bool", name: "isHidden" },
      { type: "relation", name: "chairs", collectionId: users.id, maxSelect: 25, cascadeDelete: false },
      { type: "text", name: "defaultWhatsappLink", max: 500 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_societies_slug ON societies (slug)',
      'CREATE INDEX idx_societies_hidden ON societies (isHidden)',
    ],
  })

  var events = createIfMissing(app, {
    type: "base",
    name: "events",
    listRule: '(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)',
    viewRule: '(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)',
    createRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)',
    updateRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id && @request.body.registeredCount:changed = false && @request.body.checkedInCount:changed = false && (@request.body.isDeleted:changed = false || @request.body.isDeleted = true))',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "text", name: "title", required: true, max: 200 },
      { type: "text", name: "slug", required: true, max: 220 },
      { type: "editor", name: "description" },
      { type: "date", name: "date", required: true },
      { type: "date", name: "endDate" },
      { type: "text", name: "venue", max: 250 },
      { type: "number", name: "price", min: 0 },
      { type: "file", name: "banner", maxSelect: 1, maxSize: 15728640, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
      { type: "relation", name: "society", collectionId: societies.id, maxSelect: 1, required: true, cascadeDelete: false },
      { type: "select", name: "status", values: ["draft", "published", "completed", "cancelled"], maxSelect: 1, required: true },
      { type: "number", name: "maxCapacity", min: 0 },
      { type: "number", name: "registeredCount", min: 0 },
      { type: "number", name: "checkedInCount", min: 0 },
      { type: "bool", name: "registrationOpen" },
      { type: "date", name: "registrationStart" },
      { type: "date", name: "registrationDeadline" },
      { type: "json", name: "formTemplate" },
      { type: "bool", name: "checkInEnabled" },
      { type: "bool", name: "collectIeeeMember" },
      { type: "email", name: "contactEmail" },
      { type: "text", name: "contactPhone", max: 40 },
      { type: "text", name: "externalLink", max: 1000 },
      { type: "text", name: "externalFormUrl", max: 1000 },
      { type: "text", name: "whatsappLink", max: 1000 },
      { type: "text", name: "tags", max: 1000 },
      { type: "bool", name: "isDeleted" },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_events_slug ON events (slug)',
      'CREATE INDEX idx_events_status_date ON events (status, date)',
      'CREATE INDEX idx_events_dates ON events (date, endDate)',
      'CREATE INDEX idx_events_society ON events (society)',
      'CREATE INDEX idx_events_isDeleted ON events (isDeleted)',
    ],
  })

  var registrations = createIfMissing(app, {
    type: "base",
    name: "registrations",
    listRule: 'user = @request.auth.id || @request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)',
    viewRule: 'user = @request.auth.id || @request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)',
    createRule: null,
    updateRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id && @request.body.paymentStatus:changed = false && @request.body.amount:changed = false && @request.body.registrationStatus != "confirmed")',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "text", name: "userName", max: 180 },
      { type: "email", name: "userEmail" },
      { type: "text", name: "userPhone", max: 40 },
      { type: "select", name: "registrationStatus", values: ["pending", "confirmed", "cancelled"], maxSelect: 1, required: true },
      { type: "select", name: "paymentStatus", values: ["pending", "paid", "failed", "not_required"], maxSelect: 1, required: true },
      { type: "bool", name: "checkedIn" },
      { type: "date", name: "checkedInAt" },
      { type: "text", name: "ticketId", max: 100 },
      { type: "text", name: "paymentTicketId", max: 100 },
      { type: "number", name: "amount", min: 0 },
      { type: "text", name: "couponCode", max: 100 },
      { type: "number", name: "discountAmount", min: 0 },
      { type: "json", name: "paymentData" },
      { type: "json", name: "formResponses" },
      { type: "date", name: "registrationDate" },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_registrations_ticketId ON registrations (ticketId) WHERE ticketId != ""',
      'CREATE UNIQUE INDEX idx_registrations_user_event ON registrations (user, event) WHERE registrationStatus != "cancelled"',
      'CREATE UNIQUE INDEX idx_registrations_payment_ticket ON registrations (paymentTicketId) WHERE paymentTicketId != ""',
      'CREATE INDEX idx_registrations_event ON registrations (event)',
      'CREATE INDEX idx_registrations_status ON registrations (registrationStatus)',
      'CREATE INDEX idx_registrations_regdate ON registrations (registrationDate)',
    ],
  })

  var coupons = createIfMissing(app, {
    type: "base",
    name: "coupons",
    listRule: '@request.auth.role = "admin" || @request.auth.role = "chair"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "chair"',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "chair"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "chair"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "chair"',
    fields: [
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "text", name: "code", required: true, max: 100 },
      { type: "text", name: "description", max: 300 },
      { type: "number", name: "discountPercent", min: 0, max: 100 },
      { type: "number", name: "maxUses", min: 0 },
      { type: "number", name: "usedCount", min: 0 },
      { type: "date", name: "expiresAt" },
      { type: "bool", name: "isActive" },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_coupons_code ON coupons (code)'],
  })

  createIfMissing(app, {
    type: "base",
    name: "execom",
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "text", name: "name", required: true, max: 180 },
      { type: "text", name: "position", required: true, max: 180 },
      { type: "text", name: "department", max: 120 },
      { type: "text", name: "batch", max: 80 },
      { type: "text", name: "section", max: 100 },
      { type: "text", name: "sectionId", max: 100 },
      { type: "number", name: "order" },
      { type: "file", name: "photo", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
      { type: "text", name: "linkedin", max: 1000 },
      { type: "text", name: "instagram", max: 1000 },
      { type: "email", name: "email" },
      { type: "text", name: "phone", max: 40 },
      { type: "text", name: "category", max: 100 },
      { type: "relation", name: "society", collectionId: societies.id, maxSelect: 1, cascadeDelete: false },
    ],
    indexes: [
      'CREATE INDEX idx_execom_order ON execom ("order")',
      'CREATE INDEX idx_execom_section ON execom (sectionId)',
      'CREATE INDEX idx_execom_society ON execom (society)',
    ],
  })

  createIfMissing(app, {
    type: "base",
    name: "blogs",
    listRule: 'published = true || @request.auth.role = "admin" || @request.auth.role = "content"',
    viewRule: 'published = true || @request.auth.role = "admin" || @request.auth.role = "content"',
    createRule: '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation = @request.auth.id)',
    updateRule: '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation:changed = false)',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "content"',
    fields: [
      { type: "text", name: "title", required: true, max: 240 },
      { type: "text", name: "slug", required: true, max: 180 },
      { type: "text", name: "excerpt", max: 600 },
      { type: "editor", name: "content" },
      { type: "url", name: "cover_url" },
      { type: "number", name: "read_minutes", min: 1, max: 240 },
      { type: "text", name: "topic_label", max: 120 },
      { type: "select", name: "category", values: ["IEEE", "Society", "Event"], maxSelect: 1 },
      { type: "bool", name: "published" },
      { type: "date", name: "published_at" },
      { type: "relation", name: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "society", collectionId: societies.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, cascadeDelete: false },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_blogs_slug_unique ON blogs (slug)',
      'CREATE INDEX idx_blogs_published_at ON blogs (published, published_at)',
    ],
  })

  // ── FIFA game ─────────────────────────────────────────────────────
  var matches = createIfMissing(app, {
    type: "base",
    name: "fifa_matches",
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "text", name: "team_home", required: true, max: 100 },
      { type: "text", name: "team_away", required: true, max: 100 },
      { type: "select", name: "stage", values: ["group", "r32", "r16", "qf", "sf", "third_place", "final"], maxSelect: 1, required: true },
      { type: "date", name: "kickoff_at", required: true },
      { type: "date", name: "betting_locks_at" },
      { type: "select", name: "status", values: ["upcoming", "live", "finished", "void"], maxSelect: 1, required: true },
      { type: "select", name: "result_winner", values: ["home", "away", "draw"], maxSelect: 1 },
      { type: "number", name: "result_home_goals" },
      { type: "number", name: "result_away_goals" },
      { type: "json", name: "result_scorers" },
      { type: "number", name: "result_yellow_cards" },
      { type: "number", name: "result_red_cards" },
      { type: "bool", name: "result_home_clean_sheet" },
      { type: "bool", name: "result_away_clean_sheet" },
      { type: "select", name: "result_advance", values: ["home", "away"], maxSelect: 1 },
      { type: "bool", name: "result_after_extra_time" },
      { type: "bool", name: "result_after_penalties" },
      { type: "bool", name: "settled" },
      { type: "json", name: "external_ids" },
    ],
    indexes: [
      'CREATE INDEX idx_fifa_matches_stage_kickoff ON fifa_matches (stage, kickoff_at)',
      'CREATE INDEX idx_fifa_matches_status ON fifa_matches (status)',
    ],
  })

  var markets = createIfMissing(app, {
    type: "base",
    name: "fifa_bet_markets",
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "relation", name: "match", collectionId: matches.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "select", name: "market_type", values: ["match_winner", "total_goals_ou", "correct_score", "any_scorer", "cards_ou", "clean_sheet", "custom"], maxSelect: 1, required: true },
      { type: "select", name: "mode", values: ["pool", "fixed"], maxSelect: 1, required: true },
      { type: "number", name: "line" },
      { type: "json", name: "fixed_odds" },
      { type: "json", name: "options" },
      { type: "bool", name: "is_open" },
      { type: "bool", name: "void" },
      { type: "number", name: "pool_total", min: 0 },
      { type: "json", name: "pool_by_option" },
    ],
    indexes: ['CREATE INDEX idx_fifa_bet_markets_match ON fifa_bet_markets (match)'],
  })

  var bets = createIfMissing(app, {
    type: "base",
    name: "fifa_bets",
    listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "relation", name: "match", collectionId: matches.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "relation", name: "market", collectionId: markets.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "text", name: "selection", required: true, max: 100 },
      { type: "number", name: "stake", required: true, min: 1 },
      { type: "select", name: "mode", values: ["pool", "fixed"], maxSelect: 1, required: true },
      { type: "number", name: "odds_locked", min: 0 },
      { type: "select", name: "status", values: ["pending", "won", "lost", "void"], maxSelect: 1, required: true },
      { type: "number", name: "payout", min: 0 },
      { type: "date", name: "placed_at" },
    ],
    indexes: [
      'CREATE INDEX idx_fifa_bets_user_market ON fifa_bets (user, market)',
      'CREATE INDEX idx_fifa_bets_match_status ON fifa_bets (match, status)',
      'CREATE INDEX idx_fifa_bets_user_status ON fifa_bets (user, status)',
    ],
  })

  createIfMissing(app, {
    type: "base",
    name: "fifa_transactions",
    listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { type: "select", name: "type", values: ["starting_grant", "bet_placed", "bet_payout", "bet_refund", "daily_topup", "admin_adjust", "raffle"], maxSelect: 1, required: true },
      { type: "number", name: "amount", required: true },
      { type: "number", name: "balance_after" },
      { type: "relation", name: "ref_bet", collectionId: bets.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "note", max: 500 },
      { type: "date", name: "timestamp" },
    ],
    indexes: [
      'CREATE INDEX idx_fifa_transactions_user ON fifa_transactions (user)',
      'CREATE INDEX idx_fifa_transactions_type ON fifa_transactions (type)',
    ],
  })

  var settings = createIfMissing(app, {
    type: "base",
    name: "fifa_settings",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: '@request.auth.role = "admin"',
    deleteRule: null,
    fields: [
      { type: "text", name: "event_name", max: 200 },
      { type: "number", name: "starting_balance", min: 0 },
      { type: "number", name: "max_bet_percent", min: 0, max: 100 },
      { type: "number", name: "daily_topup_threshold", min: 0 },
      { type: "number", name: "daily_topup_target", min: 0 },
      { type: "number", name: "pool_house_cut_percent", min: 0, max: 100 },
      { type: "number", name: "raffle_tickets_base", min: 0 },
      { type: "number", name: "raffle_tickets_decay", min: 0 },
      { type: "number", name: "raffle_active_participant_min_bets", min: 0 },
      { type: "date", name: "raffle_drawn_at" },
      { type: "relation", name: "raffle_winner", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "raffle_seed", max: 200 },
      { type: "json", name: "raffle_entries_snapshot" },
      { type: "text", name: "prize", max: 500 },
      { type: "bool", name: "registration_open" },
    ],
  })

  createIfMissing(app, {
    type: "base",
    name: "fifa_feed_events",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { type: "select", name: "type", values: ["bet_placed", "result", "raffle", "system"], maxSelect: 1, required: true },
      { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "match", collectionId: matches.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "message", max: 500 },
    ],
    indexes: ['CREATE INDEX idx_fifa_feed_events_type ON fifa_feed_events (type)'],
  })

  // Seed the one settings row only for a truly fresh database.
  try {
    app.findFirstRecordByFilter("fifa_settings", "1 = 1", {})
  } catch (_) {
    var row = new Record(settings, {
      event_name: "WC Predict '26",
      starting_balance: 1000,
      max_bet_percent: 25,
      daily_topup_threshold: 100,
      daily_topup_target: 200,
      pool_house_cut_percent: 0,
      raffle_tickets_base: 50,
      raffle_tickets_decay: 2,
      raffle_active_participant_min_bets: 5,
      prize: "",
      registration_open: true,
    })
    app.saveNoValidate(row)
  }
})
