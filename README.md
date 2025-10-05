# SessionDB
This is just a quick database I made to track who'd played what games locally.

It's just a console app that you paste in https://www.rpgchronicles.net reporting extension exports and it records it as played info into a local SQLite database.

## Key Limitations
* UI is terrible: I made this in one afternoon - it does the trick. In an ideal world the UI would be web-based, but then I'd have to bother hosting it & making UI's so for now I was lazy.
* Only scenarios: Yeah, pretty much. That's what I cared about. I might bother adding others later.
* Requires code to add new scenarios: Yep, but code's not too hard for me.

## Environment Setup
### 1. Install dependencies
Make sure you have **Node.js** (v18+ recommended) and **npm** installed.

Clone the repository, then install all dependencies from `package.json`:

```bash
npm install
```

### 2. Set up local DB
```bash
npx prisma db push
```

### 3. Run the app
```
npm run import
```
### 4. Reload Scenarios
Choose the reload scenarios option (This does an initial population of the scenarios from the JSONs for the seasons). Separated this out cause it's remarkably slow with sqlite to merge in the scenario info.
