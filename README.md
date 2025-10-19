


# Mapbox Terrain Viewer

Vue 3 + Vite app displaying 3D terrain in Los Angeles using Mapbox GL.

## Setup

```bash
# Install dependencies
pnpm install

# Create .env file
cp .env.example .env
```

Add your Mapbox token to `.env`:
```
VITE_MAPBOX_TOKEN=your_token_here
```

Get a token at https://www.mapbox.com/

## Run

```bash
# Development
pnpm dev

# Build
pnpm build

# Preview build
pnpm preview
```

## Stack

- Vue 3
- Vite
- Mapbox GL JS