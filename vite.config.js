import { defineConfig } from 'vite';

// Allow overriding base path via CI env (e.g., BASE_PATH=/city-invade-pixel-map/usa/)
export default defineConfig({
  base: process.env.BASE_PATH || '/city-invade-pixel-map/'
}); 