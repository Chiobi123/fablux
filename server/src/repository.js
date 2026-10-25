// Supabase Repository Module
// Connects to Supabase PostgreSQL for all data operations
const supabase = require('../db');

const NOW = () => new Date().toISOString();

async function one(sql, params = []) {
  // For Supabase, we use the built-in query functions
  // This is a placeholder - actual implementation uses supabase.query()
  throw new Error('Use supabase directly for queries');
}

async function many(sql, params = []) {
  throw new Error('Use supabase directly for queries');
}

async function run(sql, params = []) {
  throw new Error('Use supabase directly for queries');
}

function transaction(fn) {
  return fn();
}

async function seedProducts(products) {
  // Seed products into Supabase
  for (const p of products) {
    const { error } = await supabase
      .from('products')
      .insert([{ id: p.id, name: p.name, price: p.price, category: p.category, image: p.image, active: 1, stock: 100, created_at: NOW(), updated_at: NOW() }]);
    if (error) console.error('Seed error:', error.message);
  }
}

function getSetting(key, fallback = null) {
  return fallback; // Supabase uses different approach
}

function setSetting(key, value) {
  // Supabase uses different approach
}

module.exports = { supabase, seedProducts, getSetting, setSetting };