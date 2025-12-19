const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const Product = require('./models/Product');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow JSON parsing for API endpoints (not strictly required for GET/seed but useful later)
app.use(express.json());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/we-travel';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Use EJS as view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files from /public (CSS/JS) and /images for images
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Parse urlencoded bodies for form submissions (admin forms)
app.use(express.urlencoded({ extended: true }));

// Routes - render EJS views
app.get('/', (req, res) => res.render('index'));
app.get('/resumecv', (req, res) => res.render('resumecv'));
app.get('/contactus', (req, res) => res.render('contactus'));
app.get('/checkout', (req, res) => res.render('checkout'));

// Products page (frontend)
app.get('/products', (req, res) => res.render('products'));

// API: list products with pagination and filters
// Query params: page (1), limit (10), category, minPrice, maxPrice
app.get('/api/products', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const category = req.query.category;
    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);

    const filter = {};
    if (category) filter.category = category;
    if (!isNaN(minPrice) || !isNaN(maxPrice)) {
      filter.price = {};
      if (!isNaN(minPrice)) filter.price.$gte = minPrice;
      if (!isNaN(maxPrice)) filter.price.$lte = maxPrice;
    }

    const totalCount = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ products, pagination: { page, limit, totalPages, totalCount } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple seed endpoint to insert sample products (for development/testing)
app.get('/seed-products', async (req, res) => {
  try {
    const sample = [
      { name: 'Phuket Escape', price: 299, category: 'beach', image: '/images/home_tour_photo_1.jpg', description: 'Sunny beaches of Phuket' },
      { name: 'Cairo Adventure', price: 854, category: 'historical', image: '/images/home_tour_photo_2.jpg', description: 'Explore ancient pyramids' },
      { name: 'Santorini Getaway', price: 229, category: 'island', image: '/images/home_tour_photo_3.jpg', description: 'Romantic sunsets' },
      { name: 'Dubai Deluxe', price: 1299, category: 'city', image: '/images/home_tour_photo_4.jpg', description: 'Luxury city tour' },
      { name: 'Sri Lanka Special', price: 499, category: 'beach', image: '/images/home_tour_slider_srilanka.png', description: 'Cultural and beach mix' },
      { name: 'Turkey Highlights', price: 900, category: 'historical', image: '/images/home_tour_photo_1.jpg', description: 'Istanbul and Cappadocia' },
      { name: 'Ibiza Party', price: 5800, category: 'party', image: '/images/home_tour_photo_2.jpg', description: 'Nightlife and beaches' },
      { name: 'Maledives Retreat', price: 300, category: 'island', image: '/images/home_tour_photo_3.jpg', description: 'Overwater bungalows' },
      { name: 'Peru Trek', price: 7500, category: 'adventure', image: '/images/home_tour_photo_4.jpg', description: 'Machu Picchu trek' },
      { name: 'New York Highlights', price: 2300, category: 'city', image: '/images/home_tour_photo_1.jpg', description: 'Broadway and skyline' },
      { name: 'Budget Turkey', price: 450, category: 'historical', image: '/images/home_tour_photo_2.jpg', description: 'Affordable highlights' },
      { name: 'City Break Dubai', price: 1100, category: 'city', image: '/images/home_tour_photo_4.jpg', description: 'Short city weekend' }
    ];

    await Product.deleteMany({});
    const inserted = await Product.insertMany(sample);
    res.json({ insertedCount: inserted.length, products: inserted });
  } catch (err) {
    console.error('Seed error', err);
    res.status(500).json({ error: 'Seed failed' });
  }
});


// Fallback: if a request targets a .html file that still exists in root (legacy), serve it
app.get('/*.html', (req, res, next) => {
  const candidate = path.join(__dirname, req.path);
  if (fs.existsSync(candidate)) return res.sendFile(candidate);
  return next();
});

// 404 fallback
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
