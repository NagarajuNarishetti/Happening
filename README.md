## Happening — Multi‑Tenant Real‑Time Event Booking Platform

This repository contains Happening, a multi‑tenant event booking platform (similar to BookMyShow/Eventbrite) featuring real‑time seat selection, coordinated waitlist promotion, notifications, and enterprise‑grade authentication.

- **Architecture**: see `ABOUT_PROJECT/Architecture.md`
- **Tech Stack & Rationale**: see `ABOUT_PROJECT/TechStack.md`
- **How It Works (end‑to‑end flows)**: see `ABOUT_PROJECT/HowItWorks.md`
- **Security & Authentication**: see `ABOUT_PROJECT/SecurityAuth.md`
- **Design Decisions & Trade‑offs**: see `ABOUT_PROJECT/Decisions.md`
- **Setup & Deployment**: see `ABOUT_PROJECT/SetupDeploy.md`

### Key Capabilities

- Multi‑tenant organizations, roles: orgAdmin, Organizer, User
- Real‑time seat selection with live presence/status using WebSockets
- FCFS waitlist with automatic promotion on cancellations
- Notifications via RabbitMQ workers (email/SMS/push ready)
- Source of truth in PostgreSQL with audit history
- Keycloak authentication including social logins

### Repository Overview (high‑level)

- `client/`: Next.js app, Keycloak integration, seat selection UI
- `server/`: Node.js backend (Express/Nest‑style structure), routes for bookings, events, organizations, notifications
- `server/sql/`: schemas and improvements
- `docker/`: local compose + Keycloak theme
- `ABOUT_PROJECT/`: documentation and images

### System Screens and Explanations

Each image is included below with a short explanation of what it demonstrates.

1) Customized login page (Keycloak) with social logins
![Customized Login](./Images/cutomizedLoginPageWithSocialLoginsUsingKeyClock.png)
Description: Users authenticate via Keycloak; Google/GitHub SSO supported. Upon first login, an organization can be created for the user.

2) First page after login (home/dashboard)
![First Page After Login](./Images/FirstPageAfterLogin.png)
Description: Landing experience showing upcoming events, organization context, and quick actions.

3) Home pages (marketing/summary sections)
![Home Page 1](./Images/homePage1.png)
Description: Marketing/overview page with platform value proposition.

![Home Page 2](./Images/homePage2.png)
Description: Additional highlights about features and user journeys.

4) Create event section (Organizer workflow)
![Create Event](./Images/CreateEventSection.png)
Description: Organizers can define name, description, category, date/time, and total slots.

5) Organizer dashboard
![Organizer Dashboard](./Images/organizerDashBord.png)
Description: View and manage events, see statuses, and open seat management modals.

6) Organization switching
![Switch Organizations](./Images/optoinToSwitchOrgs.png)
Description: Users belonging to multiple orgs can switch context; role‑based access applies per org.

7) Manage seats (Organizer)
![Manage Seats](./Images/CanManageSeats.png)
Description: Organizer tools for seat map configuration and maintenance.

8) Book desired seats by selecting seat number (User)
![Seat Selection](./Images/BookDesiredSeatsBySelectingSeatNumber.png)
Description: Real‑time seat map allows selecting exact seats. Reservation logic is coordinated via Redis and confirmed in PostgreSQL.

9) When a user selects seats, others see status instantly
![Live Seat Status On Select](./Images/whenAnUserSelectsSeatsToBookItShowsStatusToOtherUsers.png)
Description: WebSocket updates broadcast seat holds/selections to all connected users to avoid collision.

10) When a user books, seats are frozen instantly for others (Socket.IO)
![Seats Freeze On Book](./Images/WhenAnUserBooksTicketsThatSetsWillGetFreezedForOtherUsersInstantlyUsingSocketIo.png)
Description: Confirmed seats become unavailable across clients in real‑time.

11) Waitlist confirmation
![Waitlist Confirmation](./Images/WatingConformation.png)
Description: If the event is full, the booking is placed in a waitlist with a `waiting_number` for FCFS promotion.

12) Waitlist visualization
![Waitlist View](./Images/Wating01.png)
Description: Users can see their waitlist status and current position.

13) Track waiting status
![Track Waiting Status](./Images/canTrackWatingStatus.png)
Description: Users can monitor status changes; notifications are emitted on promotion.

14) When other users cancel, your waitlisted booking is promoted automatically
![Promotion On Cancel](./Images/WhenOtherUsersCancelTheirTicketsYouWillGetThoseSeatsAsPerYourWatingPosition.png)
Description: Cancellation triggers Redis slot increment and FCFS promotion from the waitlist, with notifications.

15) Cancellation success modal
![Cancellation Success](./Images/CancelationSucessFullPopUpAfterCancelation.png)
Description: Post‑cancel feedback to confirm the action and next steps.

### Learn More

- For the full architecture, data flows, and concurrency control, read `ABOUT_PROJECT/Architecture.md` and `ABOUT_PROJECT/HowItWorks.md`.
- For stack details and why we chose them, see `ABOUT_PROJECT/TechStack.md` and `ABOUT_PROJECT/Decisions.md`.
- For security, auth, and RBAC, see `ABOUT_PROJECT/SecurityAuth.md`.
- To run locally or deploy, see `ABOUT_PROJECT/SetupDeploy.md`.


