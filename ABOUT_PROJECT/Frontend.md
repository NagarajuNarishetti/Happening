# Frontend Guide

## Overview
Next.js app that renders event discovery/booking, and organization management. Tailwind CSS is used for styling.

## Pages
- `client/pages/media.js`: main dashboard. Shows sections:
  - Upcoming Events (filtered by org role)
  - Your Events (bookings grouped by event)
  - Events organized by you (for organizers)
  - Create/Edit Event modals
- `client/pages/switch/[id].js`: reuses `media` but filters to a single organization and role.
- `client/pages/organizations.js`: organization hub showing orgs you manage/work in.
- `client/pages/organization/[id].js`: organization overview & members.

## Components
- `client/components/Navbar.js`: org dropdown, invites, and profile actions.
- `client/components/InvitationsButton.js`, `InviteToOrgButton.js`.

## Auth
- Keycloak integration in `client/lib/keycloak.js` and passed via `_app.js`.

## API access
- `client/lib/api.js` wraps Axios; pages call server routes for events/bookings/orgs.
