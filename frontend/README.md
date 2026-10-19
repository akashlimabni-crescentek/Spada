Readme · MD
# SPADA
 
This guide explains how to set up the project and where things are located.
 
## Requirements
 
- **Node.js 20.9 or newer.** Download the **LTS** version from [nodejs.org](https://nodejs.org). npm is installed with it.
- **Git**, to download the code.
- The **SPADA backend and workers**, running locally or hosted. The app gets its data from them.
## Setup
 
### 1. Clone the repository
 
This creates a `spada` folder on your computer containing the project:
 
```bash
git clone https://github.com/adamdoyle-dev/spada.git
cd spada
```
 
Already cloned it? Get the latest changes instead by running this inside the `spada` folder:
 
```bash
git pull
```
 
Then open the `spada` folder in your editor.
 
### 2. Set the environment variables
 
1. Find `.env.example` in the root of the project. It lists every variable the app needs, without the secret values.
2. Make a copy of it and name the copy `.env`.
3. Fill in the values using the table below.
> ⚠️ **Never commit or push `.env`.** It contains secrets that must not appear in source control or be shared publicly.
 
| Variable | What it is | Where to find it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Address of the Supabase project | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public key for Supabase login | Supabase dashboard → Project Settings → API Keys |
| `NEXT_PUBLIC_API_URL` | Address of the backend server | Shown in the terminal when you start the backend |
| `NEXT_PUBLIC_WS_URL` | Address of the live price workers | Shown in the terminal when you start the workers |
 
*These variables are correct as of the handoff at the end of Voucher One.*
 
If you add a new variable, also add it (without its value) to `.env.example`, and share the secret value through a secure channel, never by email or chat in plain text.
 
### 3. Install dependencies
 
In the terminal, inside the project folder, run:
 
```bash
npm install
```
 
This downloads every library listed in `package.json` into a `node_modules` folder.
 
## Running the project
 
**For development:**
 
```bash
npm run dev
```
 
Pages update as soon as you save a file. Use this while working on the code.
 
**To test the real version:**
 
```bash
npm run build && npm start
```
 
This builds the app exactly as users will get it, checks the code for errors, and makes sure everything compiles.
 
Either way, the terminal shows something like:
 
```
▲ Next.js 16.3.3
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000
✓ Ready
```
 
- Open the **Local** address in your browser to view the app.
- Open the **Network** address on another device on the same Wi-Fi (for example, a phone) to preview the app there. Use the production build (`npm run build && npm start`) for this. Data only loads on the other device if `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` use your computer's network address instead of `localhost`.
Press `Ctrl+C` in the terminal to stop the app.
 
## Folder structure
 
```
spada/
├── public/          Images, app icons and other public files
└── src/             All the application code
    ├── app/         Every page of the site
    │   ├── (auth)/  Login, registration and password pages
    │   └── (core)/  The main app pages once logged in
    ├── components/  shadcn/ui base components and SPADA's custom components
    ├── helpers/     Helper functions shared across components
    ├── hooks/       Fetching data from the backend API
    ├── lib/         Connecting to Supabase for login and data
    ├── providers/   Setup for the WebSocket connection and TanStack Query
    ├── stores/      Zustand stores (shared app state, such as live prices)
    ├── types/       TypeScript types for the app's data
    └── middleware.ts  Controls page access based on whether the user is logged in
```
 
Folders in brackets, like `(auth)` and `(core)`, group pages without changing their address. For example, `src/app/(core)/watchlist/page.tsx` is simply `/watchlist`.