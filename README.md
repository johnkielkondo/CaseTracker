# Digest Tracker

Digest Tracker is a case-digest workspace for Philippine law students. The frontend uses TypeScript, Vite, and Three.js; ASP.NET Core serves the built site and forwards `/api/*` to a separate Node.js API. Supabase provides authentication and database storage.

```text
Browser -- HTTPS --> Web EC2 (ASP.NET Core / YARP)
                            |
                       private network
                            |
                            v
                        API EC2 (Node.js) --> Supabase database

Browser --> Supabase Auth (sign-in and session renewal)
```

The API verifies access tokens, scopes database operations to the authenticated owner, and relies on database row-level security as an additional boundary. It handles cases, subjects, archives, and preferences. The Connection Desk at `/lab-index.html` demonstrates web-to-API communication.

Autoscaling and additional self-healing infrastructure are deferred. The current deployment uses one instance per role and systemd process restart policies. The root `user-data.sh` is a legacy CPU-load lab script, not the deployment entry point; use the scripts in `deploy/aws/` for the current application.

## AWS deployment

Use [the two-EC2 deployment guide](deploy/aws/README.md) and the [application API migration guide](deploy/aws/API-MIGRATION.md). The Ubuntu web instance uses ASP.NET Core and YARP to forward `/api/*` to the API instance's private address on port 3000. No Nginx is used. Case CRUD, subject lists, archives, and preferences now go through the EC2 API. Supabase still provides authentication and database storage. Run the SQL migration and configure the API before deploying this frontend.

The web host targets .NET 10. Set `ApiBaseUrl=http://API_PRIVATE_IP:3000` on the web server. Without that setting, static pages still work and `/api/*` returns HTTP 503. `/health` reports the web process's health independently of the API.

## Run locally

The 3D book is built with **Three.js, TypeScript, and Vite**. Use Node.js 22.12+ (or a compatible newer release).

```sh
npm install
npm run dev
```

Open http://localhost:8080. Scroll to open the leather cover and turn the curved pages, or use **Skip to sign in**. About and Developer are separate pages.

```sh
npm run build       # Type-check and build all three pages into dist/
npm run preview     # Serve the production build on port 8080
npm run test:browser # With the server running; uses installed Google Chrome
npm run test:api     # API validation and ownership tests; uses simulated upstream data
```

The ASP.NET host serves the same `dist/` build: run `npm run build` before `dotnet run` or `dotnet publish`. Do not serve the raw TypeScript files with a plain static server; serve `dist/` or use Vite. For local application development, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, run `node api/server.mjs` on port 3000, and run Vite on port 8080. Vite forwards `/api` to the local API. Authentication uses Supabase directly; database operations never use the browser's Supabase data client.

Book materials and lettering are generated locally on canvas. Scroll-driven geometry bends each page around its binding. Rendering stops when idle or when the tab is hidden. Reduced-motion users see a static book with immediately accessible details; devices without WebGL retain a static cover and usable sign-in form.

## Features and Descriptions
Digest Tracker is a specialized web application designed for Philippine law students to organize, manage, and track case digests across academic subjects. It streamlines the study workflow by combining subject management, progress tracking, dynamic color themes, and automated legal research tools.

What It Is For
Case Digest Organization: Keeps track of assigned court cases, G.R. numbers, case titles, doctrines, and digest types (Solo vs. Group) in one centralized system.

Academic Subject Management: Categorizes case digests by law school subjects (e.g., Constitutional Law I, Criminal Law I, Persons and Family Relations).

Reading Progress Tracking: Helps law students monitor which cases are currently being read, completed, or flagged as difficult during recitation preparation.

Quick Legal Research: Speeds up finding full-text decisions by automatically generating direct search links to official Philippine legal databases.

What It Can Do
Case Tracking and Management
Add and Manage Digests: Input case details with only a G.R. Number required, while keeping Case Name and Topic/Doctrine fields optional for quick logging.

Inline Editing: Modify existing case details (G.R. Number, Case Name, Topic, and Type) through an edit modal without leaving the workspace.

Status Updates: Assign color-coded progress statuses (IN PROGRESS, DONE, STUCK, or unassigned -) using dropdown controls.

Digest Classification: Categorize entries as either Solo Digest or Group Digest for better group work and recaps.

Case Deletion: Remove unneeded or duplicate digests through a confirmation dialog.

Automated Legal Search
One-Click Case Finder: Automatically constructs targeted search queries for every entry to fetch full-text opinions from lawphil.net and elibrary.judiciary.gov.ph.

Subject Workspaces
Subject Switching: Switch between active law subjects to display only the cases relevant to a specific course.

Subject Archiving: Archive completed or past semester subjects to clean up the main menu while preserving historical records for bar exam review.

Custom Subjects: Create new subject categories dynamically as new courses begin.

Customization and Interface
Personalized Color Themes: Choose from preset palettes (Sapphire Blue, Emerald Green, Crimson Red, Amethyst Purple, Slate Gray, Dark Mode).

Color Wheel Integration: Pick any custom color using a built-in hex color picker, which dynamically adjusts theme shades and hover states.

Split-Screen Book Cover Landing Page: Displays an interactive split-screen layout modeled after classic Philippine law textbooks.

Page-Flip Visual Intro: Features a CSS 3D page-flipping animation upon initial loading and smooth sliding transitions during sign-in and log-out.

Cloud Data & Authentication
Secure User Accounts: Create an account and sign in using email and password via Supabase Auth.

Cloud Sync: Stores and syncs all subjects, digests, and custom color preferences across devices in real time.
