# Render Deployment Guide for Backend

## Problem
The server was running out of memory because `ts-node/register` compiles TypeScript on-the-fly, which is very memory-intensive.

## Solution

### 1. Pre-compile TypeScript
The build process now compiles TypeScript to JavaScript before running:
- Build command: `npm install && npm run build`
- Start command: `node dist/server.js`

### 2. Render Configuration

**Option A: Using render.yaml (Automatic)**
The `render.yaml` file has been created with the correct settings.

**Option B: Manual Configuration in Render Dashboard**

1. **Build Command:**
   ```
   npm install && npm run build
   ```

2. **Start Command:**
   ```
   node dist/server.js
   ```

3. **Environment Variables:**
   - `NODE_ENV` = `production`
   - `NODE_OPTIONS` = `--max-old-space-size=512` (increases heap size to 512MB)

4. **Environment:** Node.js

### 3. What Changed

1. ✅ Added `build` script to compile TypeScript
2. ✅ Updated `start` script to use compiled JavaScript
3. ✅ Created `render.yaml` with correct configuration
4. ✅ Added `NODE_OPTIONS` to increase heap size

### 4. Verify Build Locally

```bash
npm install
npm run build
node dist/server.js
```

### 5. Troubleshooting

- **If build fails:** Make sure TypeScript is installed (`npm install`)
- **If still out of memory:** Increase `NODE_OPTIONS` to `--max-old-space-size=1024` (1GB)
- **If dist folder missing:** Run `npm run build` first
- **Port issues:** Render automatically sets `PORT` environment variable

### 6. Environment Variables Needed

Make sure these are set in Render:
- Database connection strings (Supabase)
- JWT secrets
- Any other environment variables your app needs

