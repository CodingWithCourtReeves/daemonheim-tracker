-- Up Migration
CREATE TABLE events (
  id         text        PRIMARY KEY,                 -- client UUID; enables idempotent ingest
  player     text        NOT NULL,
  type       text        NOT NULL,
  ts         bigint      NOT NULL,                    -- event time, unix ms
  data       jsonb       NOT NULL,                    -- full typed event payload
  voided     boolean     NOT NULL DEFAULT false,      -- soft delete for misreads
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial indexes: aggregate() only ever reads non-voided rows.
CREATE INDEX events_player_ts_idx   ON events (player, ts)   WHERE NOT voided;
CREATE INDEX events_player_type_idx ON events (player, type) WHERE NOT voided;

-- Down Migration
DROP TABLE events;
