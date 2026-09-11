// src/app/models/index.ts

// Barrel export - simplifies imports throughout the app
export * from './nutrition.model';
// Hand-maintained FatSecret / UPC add-food wire DTOs (no JSON schema on the API).
export * from './fatsecret.model';

// Generated from JSON schemas
export * from './generated/chat.schema';
export * from './generated/food.schema';
export * from './generated/food-preferences.schema';
export * from './generated/preferences.schema';
export * from './generated/rotation.schema';
export * from './generated/meal.schema';
export * from './generated/mealset.schema';
export * from './generated/recipe.schema';