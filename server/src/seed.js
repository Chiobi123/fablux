// Supabase Seed Module
// Seeds initial data into Supabase on server startup
const supabase = require('./db');
const productsData = require('../../js/products-data');

async function seedInitialData() {
  const products = productsData.FAB_PRODUCTS || [];

  for (const p of products) {
    const { error } = await supabase
      .from('products')
      .upsert([
        {
          id: p.id,
          name: p.name,
          price: p.price,
          category: p.category,
          image: p.image,
          active: p.active !== false ? 1 : 0,
          stock: p.stock || 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);
    if (error) console.error('Seed product error:', error.message);
  }

  // Set marketplace setting
  await supabase.from('settings').upsert([
    { key: 'marketplace_enabled', value: '0', updated_at: new Date().toISOString() }
  ]);

  console.log('Supabase seed completed');
}

module.exports = { seedInitialData };