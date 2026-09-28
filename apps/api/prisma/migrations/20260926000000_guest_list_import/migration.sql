-- A stable, device-generated key makes guest-list import retryable without
-- creating another copy of the list or its items. Existing lists keep NULL.
alter table public.todo_lists add column import_key varchar(128);

create unique index todo_lists_owner_id_import_key_key
  on public.todo_lists(owner_id, import_key);
