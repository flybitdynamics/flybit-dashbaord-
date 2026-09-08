# Firebase setup

The desk stores shows, payments and company settings in Firestore
(project **flybit-530c5**), so the data is shared across machines instead of
living in one browser.

## One-time step: publish the security rules

A new Firestore database denies everything by default — the desk will show
*"Firestore refused the request"* until the rules are published.

1. Open the [Firestore rules editor](https://console.firebase.google.com/project/flybit-530c5/firestore/rules)
2. Replace what is there with the contents of `firestore.rules`
3. Click **Publish**

If the database itself has not been created yet, do that first: Firestore
Database → Create database → **Native mode** → pick the `asia-south1` (Mumbai)
region.

## ⚠️ The rules in this repo are open

Anyone who knows the project id can read and write every booking, client phone
number and payment record. They are open so the desk works today, not because
they are safe.

`firestore.rules` carries an authenticated version at the bottom, ready to swap
in as soon as Firebase Auth is added. Do that before this is used for real
client data.

## Collections

| Path               | Holds                                  |
| ------------------ | -------------------------------------- |
| `shows/{id}`       | One booking                            |
| `payments/{id}`    | One receipt, linked by `showId`        |
| `settings/company` | The values the permission docs are filled from |
| `team/{id}`        | One team member: role, salary, leave allowance |
| `leaveRequests/{id}` | One leave application, linked by `memberId`   |
| `attendance/{id}`  | Days worked, one row per member per month      |

## Configuration

`.env.local` holds the `NEXT_PUBLIC_FIREBASE_*` values (see `.env.example`).
These are browser-side by design — a Firebase web config ships in every client
bundle, and the rules are what protect the data.
