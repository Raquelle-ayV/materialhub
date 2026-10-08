PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS credit_accounts (user_id INTEGER PRIMARY KEY REFERENCES users(id), balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0), held INTEGER NOT NULL DEFAULT 0 CHECK(held >= 0 AND held <= balance));
CREATE TABLE IF NOT EXISTS hubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, location_text TEXT NOT NULL, opening_hours TEXT NOT NULL, is_placeholder INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS zones (id INTEGER PRIMARY KEY, hub_id INTEGER NOT NULL REFERENCES hubs(id), name TEXT NOT NULL UNIQUE, qr_key TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, zone_id INTEGER NOT NULL UNIQUE REFERENCES zones(id), sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS material_code_sequence (id INTEGER PRIMARY KEY CHECK(id=1), next_value INTEGER NOT NULL CHECK(next_value > 0));
CREATE TABLE IF NOT EXISTS materials (
 id INTEGER PRIMARY KEY, display_code TEXT NOT NULL UNIQUE, owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, category_id INTEGER NOT NULL REFERENCES categories(id), custom_category_name TEXT,
 initial_quantity INTEGER NOT NULL CHECK(initial_quantity > 0), stock_quantity INTEGER NOT NULL CHECK(stock_quantity >= 0),
 unit TEXT NOT NULL, dimensions_spec TEXT, dimensions_not_applicable INTEGER NOT NULL DEFAULT 0,
 color TEXT NOT NULL, condition TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', reference_url TEXT,
 zone_id INTEGER NOT NULL REFERENCES zones(id), status TEXT NOT NULL CHECK(status IN ('ready_for_drop_off','available','reserved','collected','unavailable','closed')),
 recorded_at TEXT NOT NULL, deposited_at TEXT, closed_at TEXT, version INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
 CHECK(category_id != 7 OR length(trim(custom_category_name)) > 0),
 CHECK(dimensions_not_applicable = 1 OR length(trim(dimensions_spec)) > 0)
);
CREATE TABLE IF NOT EXISTS deposits (
 id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL UNIQUE REFERENCES materials(id), user_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed')), arrived_at TEXT, verified_zone_id INTEGER REFERENCES zones(id), zone_verified_at TEXT,
 reward_points INTEGER NOT NULL DEFAULT 1 CHECK(reward_points=1), confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS reservations (
 id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), user_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('reserved','collected','cancelled','expired','issue_reported','returned')),
 reserved_quantity INTEGER NOT NULL CHECK(reserved_quantity > 0), collected_quantity INTEGER NOT NULL DEFAULT 0 CHECK(collected_quantity >= 0 AND collected_quantity <= reserved_quantity),
 unit_snapshot TEXT NOT NULL, zone_id_snapshot INTEGER NOT NULL REFERENCES zones(id), cost_points INTEGER NOT NULL DEFAULT 1 CHECK(cost_points=1),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, verified_zone_id INTEGER REFERENCES zones(id), zone_verified_at TEXT, material_code_verified_at TEXT,
 completed_at TEXT, return_deadline_at TEXT, cancelled_at TEXT, cancel_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_reservation_per_user_material ON reservations(material_id,user_id) WHERE status='reserved';
CREATE TABLE IF NOT EXISTS returns (
 id INTEGER PRIMARY KEY, reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id), user_id INTEGER NOT NULL REFERENCES users(id),
 quantity INTEGER NOT NULL CHECK(quantity > 0), reason TEXT, status TEXT NOT NULL CHECK(status IN ('draft','confirmed')),
 verified_zone_id INTEGER REFERENCES zones(id), zone_verified_at TEXT, created_at TEXT NOT NULL, confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS issue_reports (
 id INTEGER PRIMARY KEY, reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id), material_id INTEGER NOT NULL REFERENCES materials(id), reporter_id INTEGER NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL CHECK(reason IN ('material_not_found','wrong_item','material_damaged','other')), notes TEXT,
 status TEXT NOT NULL CHECK(status IN ('open','resolved')), created_at TEXT NOT NULL, resolved_at TEXT, resolved_by INTEGER REFERENCES users(id), resolution TEXT
);
CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY, uploader_id INTEGER NOT NULL REFERENCES users(id), storage_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS material_photos (id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), media_id INTEGER NOT NULL REFERENCES media(id), kind TEXT NOT NULL CHECK(kind IN ('material','placement')), deposit_id INTEGER REFERENCES deposits(id), return_id INTEGER REFERENCES returns(id), sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY, recipient_id INTEGER NOT NULL REFERENCES users(id), actor_id INTEGER REFERENCES users(id), type TEXT NOT NULL, material_id INTEGER REFERENCES materials(id), reservation_id INTEGER REFERENCES reservations(id), return_id INTEGER REFERENCES returns(id), issue_id INTEGER REFERENCES issue_reports(id), created_at TEXT NOT NULL, read_at TEXT, event_key TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL REFERENCES users(id), material_id INTEGER NOT NULL REFERENCES materials(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,material_id));
CREATE TABLE IF NOT EXISTS interest_events (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), event_type TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), material_id INTEGER REFERENCES materials(id), search_term TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_entries (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), type TEXT NOT NULL,
 balance_delta INTEGER NOT NULL, held_delta INTEGER NOT NULL, balance_after INTEGER NOT NULL CHECK(balance_after >= 0), held_after INTEGER NOT NULL CHECK(held_after >= 0 AND held_after <= balance_after),
 deposit_id INTEGER REFERENCES deposits(id), reservation_id INTEGER REFERENCES reservations(id), return_id INTEGER REFERENCES returns(id), issue_id INTEGER REFERENCES issue_reports(id),
 operation_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS registration_reward_once ON credit_entries(user_id) WHERE type='registration_reward';
CREATE UNIQUE INDEX IF NOT EXISTS deposit_reward_once ON credit_entries(deposit_id) WHERE type='deposit_reward';
CREATE UNIQUE INDEX IF NOT EXISTS reservation_hold_once ON credit_entries(reservation_id) WHERE type='reservation_hold';
CREATE UNIQUE INDEX IF NOT EXISTS reservation_settle_once ON credit_entries(reservation_id) WHERE type IN ('pickup_spend','expiry_spend','cancellation_release','issue_release');
CREATE UNIQUE INDEX IF NOT EXISTS return_refund_once ON credit_entries(return_id) WHERE type='return_refund';
CREATE TABLE IF NOT EXISTS inventory_entries (id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), type TEXT NOT NULL, quantity_delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL CHECK(quantity_after >= 0), deposit_id INTEGER REFERENCES deposits(id), reservation_id INTEGER REFERENCES reservations(id), return_id INTEGER REFERENCES returns(id), operation_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
PRAGMA user_version = 1;
