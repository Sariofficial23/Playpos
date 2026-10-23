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

-- Платформа PlayPos: администраторы, клиенты (площадки, купившие программу), оплаты подписки
create table if not exists platform_admins (
  id bigserial primary key,
  email text not null,
  pass_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists platform_admins_email on platform_admins (lower(email));
create table if not exists admin_sessions (
  token_hash text primary key,
  admin_id bigint not null references platform_admins(id),
  expires_at timestamptz not null
);
create table if not exists platform_keys (
  id int primary key check (id = 1),
  public_pem text not null,
  private_pem text not null
);
create table if not exists clients (
  id bigserial primary key,
  venue text not null,
  contact text not null default '',
  phone text not null default '',
  login text not null,
  pass_hash text not null,
  paid_until timestamptz,
  lifetime boolean not null default false,
  active boolean not null default true,
  device_id text,
  device_key_hash text,
  activated_at timestamptz,
  last_seen_at timestamptz,
  app_version text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists clients_login on clients (lower(login));
create table if not exists leads (
  id bigserial primary key,
  name text not null,
  phone text not null,
  venue text not null default '',
  message text not null default '',
  ip_hash text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists leads_created on leads (created_at desc);
create table if not exists client_payments (
  id bigserial primary key,
  client_id bigint not null references clients(id),
  at timestamptz not null default now(),
  months int not null,
  amount bigint not null default 0 check (amount >= 0),
  comment text not null default '',
  prev_until timestamptz,
  new_until timestamptz,
  admin_id bigint references platform_admins(id)
);
-- Поминутный тариф (VIP): price — цена за минуту, сумма считается при выходе
alter table tariffs add column if not exists per_minute boolean not null default false;
-- rate задан — посещение поминутное (цена минуты на момент входа), end_at = время выхода
alter table visits add column if not exists rate bigint;
-- Группа: несколько детей одним посещением (мама с пятью детьми) — все суммы умножаются на qty
alter table visits add column if not exists qty int not null default 1;
-- Время вышло → таймер стоит, пока кассир не нажмёт «Продолжить»; с этого момента считается поминутная доплата
alter table visits add column if not exists over_from timestamptz;
-- Скидка и оплата частями: сколько принято наличными и картой по каждому счёту
alter table bills add column if not exists discount bigint not null default 0;
alter table bills add column if not exists paid_cash bigint;
alter table bills add column if not exists paid_card bigint;
-- Ограничение пересоздаём один раз (когда в нём ещё нет 'mixed'), чтобы не блокировать таблицу счетов при каждом запуске
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bills_method_check' and pg_get_constraintdef(oid) like '%mixed%') then
    alter table bills drop constraint if exists bills_method_check;
    alter table bills add constraint bills_method_check check (method in ('cash', 'card', 'mixed'));
  end if;
end $$;
update bills b set paid_cash = case when b.method = 'cash' then s.total else 0 end, paid_card = case when b.method = 'card' then s.total else 0 end
  from (select bill_id, sum(amount) as total from bill_items group by bill_id) s
  where s.bill_id = b.id and b.status = 'paid' and b.paid_cash is null;
-- Один раз каждой площадке: поминутный тариф «По факту» (если его ещё нет); дальше владелец может его менять или убрать в архив
insert into tariffs (tenant_id, name, minutes, price, use, per_minute)
  select t.id, 'По факту (поминутно)', 1, 1000, 'base', true from tenants t
  where not coalesce((t.settings->>'pmSeeded')::boolean, false)
    and not exists (select 1 from tariffs x where x.tenant_id = t.id and x.per_minute);
update tenants set settings = settings || '{"pmSeeded": true}'::jsonb where not coalesce((settings->>'pmSeeded')::boolean, false);
`;
