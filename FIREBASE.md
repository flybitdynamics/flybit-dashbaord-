# Firebase setup

The desk keeps everything in Firestore (project **flybit-530c5**) and signs
people in with Firebase Authentication. Passwords live in Authentication only —
never in Firestore.

## Switching on logins — do these in order

**1. Enable Email/Password sign-in.**
[Authentication → Sign-in method](https://console.firebase.google.com/project/flybit-530c5/authentication/providers)
→ *Get started* (first time only) → **Email/Password** → Enable → Save.

Until this is done the sign-in page says *"Firebase Authentication is not
switched on for this project yet"* and nobody can get in.

**2. Create the super admin.** Open the desk. The sign-in page shows *"Nobody
has set up this desk yet"* → **Set up**. Fill in name, email, employee ID, phone
and a password (8+ characters). That account becomes the super admin, and five
starting roles are written: Admin, Operations, Accounts, Pilot, Viewer.

This works exactly once. After it, the setup option disappears.

**3. Publish the security rules.**
[Firestore → Rules](https://console.firebase.google.com/project/flybit-530c5/firestore/rules)
→ replace everything with the contents of `firestore.rules` → **Publish**.

Do this *after* step 2. Before it, the current open rules are still live —
anyone with the project id can read and write everything. Publishing is what
makes the roles real.

**4. Add people.** Settings → **Users & Permissions** (super admin only) →
*Add person*. Give them a role; share the temporary password privately. They
can change it under Settings → My account.

## How permissions work

Each person has **one role**. A role is a grid of *area × action*:

| Area | View | Add | Edit | Delete |
| ---- | :--: | :-: | :--: | :----: |
| Shows, Clients, Pilots, Finance & payments, Team | ✓ | ✓ | ✓ | ✓ |
| Calendar, Permission documents | ✓ | | | |
| Company settings | ✓ | | ✓ | |

The **super admin** sits above every role: full access, and the only person
who can add people, change roles, or make someone else super admin. A super
admin cannot demote or turn off themselves, so the desk always has one.

The screens hide what a role cannot do, and **the rules enforce the same
thing on the server** — hiding a button is a convenience, not the protection.

## What is not covered yet

- **The two server routes are not behind the login.** `/api/upload` (receipts
  to Cloudflare R2) and `/api/permission-docs` (Word/PDF generation) answer
  anyone who can reach the server.
- **The rules have not been run against the emulator.** There is no Java on
  this machine, so they are desk-checked, not tested. The console checks the
  syntax when you publish; if anything is refused that should not be, the
  desk shows the error and the rule to look at is named in it.
- **Deleting a login** has to be done in the console (Authentication → Users).
  From the desk you *turn someone off*, which blocks them at once.

## If you get locked out

- Forgotten password: *Forgot password?* on the sign-in page.
- Lost the only super admin: in the console, Firestore → `users` → pick a
  person → set `superAdmin` to `true`.

## Collections

| Path                 | Holds                                                   |
| -------------------- | ------------------------------------------------------- |
| `shows/{id}`         | One booking, from inquiry to closed                     |
| `clients/{id}`       | A direct or B2B client                                  |
| `pilots/{id}`        | A remote pilot and their DGCA certificate               |
| `places/{id}`        | State / city / area, remembered for the next booking    |
| `payments/{id}`      | One receipt, linked by `showId`                         |
| `expenses/{id}`      | Money out that is not salary or commission              |
| `settings/company`   | The values the permission documents are filled from     |
| `team/{id}`          | One team member: role, salary, leave allowance          |
| `leaveRequests/{id}` | One leave application, linked by `memberId`             |
| `attendance/{id}`    | Days worked, one row per member per month               |
| `users/{uid}`        | Who can sign in, and their role — no passwords          |
| `roles/{id}`         | The permission grid for each role                       |
| `meta/setup`         | Written once when the super admin is created            |

## Configuration

`.env.local` holds the `NEXT_PUBLIC_FIREBASE_*` values (see `.env.example`).
These are browser-side by design — a Firebase web config ships in every client
bundle; the rules are what protect the data.
