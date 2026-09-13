# Cloud-Based College Event Management System

A complete, responsive college event platform built with pure HTML, CSS, JavaScript and Firebase services for Saraswati Group of Colleges.

## Features

- Student signup, login and role-based access
- Student dashboard, profile and my-events pages
- Admin dashboard and event management flows
- Event creation with poster upload
- Dynamic events listing, event details and registration logic
- Registration count and duplicate prevention
- Event gallery and photo lightbox
- Firebase Authentication, Firestore, Storage and Hosting support
- Responsive, editorial-style UI inspired by premium event websites

## Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- Firebase Authentication
- Firestore
- Storage
- Firebase Hosting

## Folder Structure

```text
college-event-management/
├── index.html
├── events.html
├── event-details.html
├── gallery.html
├── about.html
├── student/
│   ├── login.html
│   ├── signup.html
│   ├── dashboard.html
│   ├── my-events.html
│   └── profile.html
├── admin/
│   ├── login.html
│   ├── dashboard.html
│   ├── create-event.html
│   ├── manage-events.html
│   ├── registrations.html
│   ├── students.html
│   └── gallery-management.html
├── css/
│   ├── style.css
│   ├── responsive.css
│   ├── auth.css
│   ├── student.css
│   └── admin.css
├── js/
│   ├── firebase-config.js
│   ├── auth.js
│   ├── events.js
│   ├── event-details.js
│   ├── registration.js
│   ├── gallery.js
│   ├── student.js
│   ├── admin.js
│   └── ui.js
├── assets/
│   ├── images/
│   ├── icons/
│   └── logos/
├── firebase/
│   ├── firestore.rules
│   └── storage.rules
├── README.md
└── .firebaserc
```

## Firebase Setup

1. Create a Firebase project in the Firebase Console.
2. Enable Authentication and then enable Email/Password.
3. Create a Firestore database in native mode.
4. Create a Firebase Storage bucket.
5. Add a web app to your project and copy the config object.
6. Replace the placeholder values in `js/firebase-config.js`.
7. Add the Firestore and Storage security rules from the `firebase/` folder.
8. Create the first admin account in Firebase Authentication and then create a `users/{uid}` record with `role: "admin"`.

## Firestore Structure

### users
- `name`
- `email`
- `rollNo`
- `department`
- `semester`
- `phone`
- `role`
- `createdAt`

### events
- `title`
- `description`
- `category`
- `department`
- `date`
- `startTime`
- `endTime`
- `venue`
- `maxSeats`
- `registrationDeadline`
- `posterURL`
- `status`
- `createdAt`
- `createdBy`
- `organizer`
- `registeredCount`

### registrations
- `eventId`
- `studentId`
- `studentName`
- `rollNo`
- `department`
- `semester`
- `email`
- `registeredAt`
- `status`

### galleries
- `eventId`
- `eventName`
- `description`
- `coverImage`
- `photos`
- `createdAt`

## Security Rules Summary

- Students can read public events and public galleries.
- Students can create registration records for themselves.
- Students can update their own profile info.
- Students cannot manage events, galleries or other registrations.
- Admins can create, update, delete events and galleries, and view all registrations.

## Local Development

1. Install Firebase CLI if you do not already have it.
2. Open the project folder in a local web server.
3. Replace Firebase config placeholders.
4. Serve the project with a static server or open it directly in a browser.

Example using VS Code Live Server or Python:

```bash
python -m http.server 8000
```

Then open: `http://localhost:8000`

## Deployment

```bash
firebase login
firebase init hosting
firebase deploy
```

## Notes

- This project intentionally uses pure HTML, CSS and JavaScript only.
- Firebase credentials are placeholder values and must be replaced before deployment.
- The UI uses a premium editorial aesthetic with a responsive layout for desktop, tablet and mobile.
