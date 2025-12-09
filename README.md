# Procedural Animation Experiments

A Svelte + PixiJS project for experimenting with procedural creature animations.

## Tech Stack

- **Svelte 5** - Modern reactive UI framework
- **SvelteKit** - Full-stack framework
- **PixiJS** - High-performance 2D WebGL renderer
- **TypeScript** - Type-safe development

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

## Project Structure

- `src/lib/PixiCanvas.svelte` - Main canvas component that initializes PixiJS
- `src/lib/DrawingUtils.ts` - Utility functions for drawing 2D shapes
- `src/routes/+page.svelte` - Main page

## Drawing Utils API

The `DrawingUtils` class provides easy-to-use methods for drawing shapes:

- `circle()` - Draw circles
- `ellipse()` - Draw ellipses
- `rect()` - Draw rectangles
- `polygon()` - Draw polygons from points
- `line()` - Draw lines
- `bezierCurve()` - Draw bezier curves
- `smoothCurve()` - Draw smooth curves through multiple points

Helper functions:
- `point()` - Create a point object
- `distance()` - Calculate distance between points
- `angleBetween()` - Calculate angle between points
- `rotatePoint()` - Rotate a point around a center
- `lerp()` / `lerpPoint()` - Linear interpolation

## Next Steps

Ready to create procedural creatures! The boilerplate is set up with:
- ✅ PixiJS integrated with Svelte
- ✅ 800x600 canvas with dark theme
- ✅ Drawing utilities for shapes and curves
- ✅ Example creature rendered on the canvas
- ✅ TypeScript support throughout
