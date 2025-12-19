# We Travel — Express wrapper for static site

This repository contains your existing static HTML/CSS site. I added a minimal Express server so you can run the site with Node.

How it works
- `server.js` serves your static assets (CSS, JS, images) and maps requests like `/resumecv` to `resumecv.html` if the file exists.

Quick start
1. Install dependencies:

   npm install

2. Start the server:

   npm start

3. Open http://localhost:3000

Developer notes / next steps
- Convert repeated parts (header/footer) into a template engine (EJS/Pug) if you'd like to avoid duplication.
- Add route handlers or an API for dynamic features.
- Consider moving static files into a `public/` directory and update `server.js` to serve that directory.
