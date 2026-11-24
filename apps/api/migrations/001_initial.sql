-- CF LS initial schema. All identifiers are UUIDs and all timestamps are timestamptz/UTC.
-- Username uniqueness is case-insensitive via lower(username) because citext is not available in all test targets.

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  username      text NOT NULL,
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    text NOT NULL CHECK (role IN ('editor', 'reviewer', 'admissions', 'admin')),
  PRIMARY KEY (user_id, role)
);
CREATE INDEX idx_user_roles_role ON user_roles(role);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE contents (
  id           uuid PRIMARY KEY,
  type         text NOT NULL CHECK (type IN
               ('school','academics','outcomes','campus','student_union','news','admissions','contact')),
  category     varchar(40) NOT NULL,
  title        varchar(120) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  summary      varchar(300),
  body         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','pending_review','approved','published')),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  author_id    uuid NOT NULL REFERENCES users(id),
  reviewer_id  uuid REFERENCES users(id),
  published_at timestamptz,
  is_demo      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  CHECK (summary IS NULL OR char_length(summary) <= 300),
  CHECK (char_length(body) <= 20000),
  CHECK ((type, category) IN (
    ('school','overview'),('school','head_message'),('school','mission'),
    ('school','history'),('school','faculty'),('school','partnerships'),
    ('academics','overview'),('academics','foundation'),('academics','ap'),
    ('academics','alevel'),('academics','subjects'),('academics','calendar'),
    ('outcomes','counseling'),('outcomes','outcomes'),
    ('admissions','why_us'),('admissions','application'),('admissions','requirements'),
    ('admissions','fees'),('admissions','faq'),('admissions','consultation'),
    ('campus','clubs'),('campus','boarding'),('campus','facilities'),
    ('news','updates'),('contact','contact'),('student_union','overview')
  ))
);
CREATE INDEX idx_contents_public ON contents(type, status, published_at DESC);
CREATE INDEX idx_contents_author ON contents(author_id, status);
CREATE INDEX idx_contents_news ON contents(status, published_at DESC, id DESC);

CREATE TABLE content_revisions (
  id         uuid PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  snapshot   jsonb NOT NULL,
  actor_id   uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, version)
);
CREATE INDEX idx_revisions_content ON content_revisions(content_id, version DESC);

CREATE TABLE audit_events (
  id          uuid PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text,
  request_id  text NOT NULL,
  result      text NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX idx_audit_target ON audit_events(target_type, target_id);

CREATE FUNCTION cfls_audit_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION cfls_audit_append_only();

CREATE TABLE inquiries (
  id           uuid PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('consultation', 'visit')),
  test_name    varchar(40) NOT NULL CHECK (char_length(btrim(test_name)) BETWEEN 1 AND 40),
  test_contact varchar(100) NOT NULL,
  message      varchar(500),
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed')),
  is_test      boolean NOT NULL DEFAULT true CHECK (is_test),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inquiries_created ON inquiries(created_at DESC);

CREATE TABLE idempotency_keys (
  scope        text NOT NULL,
  key          uuid NOT NULL,
  request_hash text NOT NULL,
  result_ref   uuid REFERENCES inquiries(id),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
