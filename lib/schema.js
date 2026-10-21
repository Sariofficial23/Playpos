// Схема базы PlayPos. Применяется автоматически при первом запросе (идемпотентно).
// Деньги — целые суммы в сумах (bigint), время — timestamptz (UTC), показывается в Asia/Tashkent.
// Все бизнес-данные привязаны к tenant_id (площадке).
export const SCHEMA = `
create table if not exists tenants (
  id bigserial primary key,
  name text not null,
  settings jsonb not null default '{}',
  seq bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists users (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  name text not null,
  login text not null,
  pass_hash text not null,
  role text not null check (role in ('owner', 'admin', 'cashier')),
  perms jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists users_login_uq on users (lower(login));
create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users(id),
  tenant_id bigint not null references tenants(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists login_attempts (
  key text primary key,
  fails int not null default 0,
  locked_until timestamptz
);
create table if not exists tariffs (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  name text not null,
  minutes int not null check (minutes > 0),
  price bigint not null check (price >= 0),
  use text not null default 'both' check (use in ('both', 'base', 'ext')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists shifts (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  no int not null,
  user_id bigint not null references users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash bigint not null check (opening_cash >= 0),
  counted_cash bigint
);
create unique index if not exists shifts_one_open on shifts (tenant_id, user_id) where closed_at is null;
create table if not exists visits (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  no bigint not null,
  child text not null,
  tariff_name text not null,
  minutes int not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  exit_at timestamptz,
  user_id bigint not null references users(id)
);
create index if not exists visits_active on visits (tenant_id) where exit_at is null;
create index if not exists visits_start on visits (tenant_id, start_at);
create table if not exists visit_ext (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  visit_id bigint not null references visits(id),
  at timestamptz not null default now(),
  minutes int not null,
  price bigint not null,
  from_mode text not null check (from_mode in ('prev', 'now')),
  user_id bigint not null references users(id)
);
create table if not exists bills (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  no bigint not null,
  visit_id bigint not null references visits(id),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  method text check (method in ('cash', 'card')),
  paid_at timestamptz,
  paid_by bigint references users(id),
  shift_id bigint references shifts(id),
  created_at timestamptz not null default now(),
  check (status <> 'paid' or (method is not null and paid_at is not null and shift_id is not null))
);
create index if not exists bills_visit on bills (visit_id);
create index if not exists bills_paid on bills (tenant_id, paid_at);
create table if not exists bill_items (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  bill_id bigint not null references bills(id),
  title text not null,
  amount bigint not null check (amount >= 0),
  kind text not null check (kind in ('base', 'ext')),
  minutes int not null
);
create index if not exists bill_items_bill on bill_items (bill_id);
create table if not exists refunds (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  bill_id bigint not null references bills(id),
  amount bigint not null check (amount > 0),
  reason text not null,
  at timestamptz not null default now(),
  user_id bigint not null references users(id),
  shift_id bigint not null references shifts(id),
  method text not null check (method in ('cash', 'card'))
);
create table if not exists expenses (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  at timestamptz not null default now(),
  category text not null,
  amount bigint not null check (amount > 0),
  comment text not null default '',
  user_id bigint not null references users(id),
  source text not null check (source in ('cash', 'other')),
  shift_id bigint references shifts(id),
  check (source <> 'cash' or shift_id is not null)
);
create table if not exists audit_log (
  id bigserial primary key,
  tenant_id bigint not null references tenants(id),
  at timestamptz not null default now(),
  user_id bigint references users(id),
  action text not null,
  detail text not null default ''
);
create index if not exists audit_tenant on audit_log (tenant_id, at desc);
`;
