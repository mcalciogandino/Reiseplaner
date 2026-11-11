-- Tagesplan: Programmpunkte können als «Plan B» (Ausweichidee) markiert werden.
alter table day_plan_items add column if not exists plan_b boolean not null default false;
