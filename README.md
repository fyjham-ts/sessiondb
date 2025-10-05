# SessionDB
This is just a quick database I made to track who'd played what games locally.

It's just a console app that you paste in https://www.rpgchronicles.net reporting extension exports and it records it as played info into a local SQLite database.

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
