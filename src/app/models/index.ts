// src/app/models/index.ts

// Barrel export - simplifies imports throughout the app
export * from './nutrition.model';

// Side-effect import: augments the generated MenuSlot with single-meal compat
// mirror fields (mealId/mealName/mealType derived from meals[0]).
import './menu-slot-compat';

// Generated from JSON schemas
export * from './generated/chat.schema';
export * from './generated/food.schema';
export * from './generated/food-preferences.schema';
export * from './generated/preferences.schema';
export * from './generated/rotation.schema';
export * from './generated/meal.schema';