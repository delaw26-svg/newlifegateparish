RCCG NEW LIFE GATE PARISH — NETLIFY DEPLOYMENT PACKAGE

WHAT IS INCLUDED
- index.html: church management web app
- netlify/functions/church-data.js: backend API using Netlify Blobs
- netlify.toml: Netlify build/function configuration
- package.json: required Netlify Blobs dependency

DEPLOYMENT STEPS
1. Download and extract this ZIP.
2. Upload the extracted folder to a new GitHub repository.
3. Sign in to Netlify and choose Add new site -> Import an existing project.
4. Connect the GitHub repository and deploy. The included netlify.toml configures the site and function.
5. After deployment, open the Netlify website URL and test the connection panel.
6. Choose Administrator Sign In:
   Username: admin
   Password: Law123@
7. Staff can be created from the administrator's user-management section. Staff sign in through the separate staff login.
8. Test by recording a service, then refresh the website and sign in on another device to confirm shared records.
9. Export a JSON backup before using the clear/delete records feature.

IMPORTANT NOTES
- No custom Netlify environment variable is required for this initial deployment.
- Netlify Blobs is used for online shared records. The app must be deployed as a Netlify site with Functions enabled; opening index.html directly is local-only unless you enter the deployed Netlify site address in the app.
- The initial administrator password is checked in the server function and is not displayed in the page. Keep it private. For a production system, change the initial credential and add rate limiting / password reset protections.
- Netlify may require a Git-based deployment to install the package dependency and build the function. A plain static drag-and-drop deployment may not build server functions.
- Keep backups of church finance and member data in a safe location.
