# Aucitya Management Hub

This is a standalone local-first project management web app. It is separate from any existing website and can be opened directly from this folder.

## Open locally

Open `index.html` in a browser, or serve this folder with any small static server.

## What it includes

- Project dashboard
- Project creation and editing
- Timelines and milestones
- Gantt chart view
- Task board
- Budgets and spend tracking
- Ownership by Bobby Joshi, Surbhi Kaushik, or both
- Owner workload view
- Local autosave
- Cross-tab live updates on the same device
- Optional Supabase realtime sync between iPhones

## Optional realtime sync

The app works immediately on one device. To sync between two iPhones, create a Supabase project, add this table, enable Realtime for it, and fill in `config.js` with your project URL and anon key:

```sql
create table public.project_rooms (
  room_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```
