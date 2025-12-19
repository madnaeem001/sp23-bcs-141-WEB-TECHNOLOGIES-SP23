const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const Product = require('./models/Product');
const Order = require('./models/Order');
const session = require('express-session');
const { checkCartNotEmpty, adminOnly } = require('./middleware/auth');

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

// Simple session middleware so we can store lightweight session data (cart, user email)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Routes - render EJS views
app.get('/', (req, res) => res.render('index'));
app.get('/resumecv', (req, res) => res.render('resumecv'));
app.get('/contactus', (req, res) => res.render('contactus'));
// Checkout page - protected by server-side cart presence
app.get('/checkout', checkCartNotEmpty, (req, res) => res.render('checkout'));

/**
 * CART VALIDATION AND RECALCULATION FUNCTION
 * 
 * This critical function ensures cart integrity by:
 * 1. Validating all cart items have required fields (name, quantity, price)
 * 2. Preventing duplicate products (same product ID or name)
 * 3. Validating quantities are positive integers
 * 4. Cross-referencing product IDs with database to ensure they exist
 * 5. Using database prices instead of client-provided prices (security)
 * 6. Recalculating total based on validated data
 * 
 * @param {Array} items - Array of cart items to validate
 * @returns {Object} - { validatedItems: Array, recalculatedTotal: Number }
 * @throws {Error} - Descriptive error for any validation failure
 */
async function validateAndRecalculateCart(items) {
  try {
    const validatedItems = [];
    let recalculatedTotal = 0;
    const seenProducts = new Set(); // Prevents duplicate products in single cart
    
    // Validate each cart item individually
    for (const item of items) {
      // Basic field validation - all items must have name, quantity, and price
      if (!item.name || !item.quantity || !item.price) {
        throw new Error('Invalid cart item: missing required fields');
      }
      
      // Duplicate prevention: Use product ID if available, otherwise use name
      const productKey = item.product ? item.product.toString() : item.name;
      if (seenProducts.has(productKey)) {
        throw new Error(`Duplicate product in cart: ${item.name}`);
      }
      seenProducts.add(productKey);
      
      // Quantity validation: Must be positive integer (no fractional quantities)
      if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new Error(`Invalid quantity for ${item.name}: must be a positive integer`);
      }
      
      // Initialize validated item structure
      let validatedItem = {
        name: item.name,
        quantity: item.quantity,
        price: 0 // Will be set from database or validated client price
      };
      
      // Database validation for products with IDs
      if (item.product) {
        try {
          // Cross-reference with database to ensure product still exists
          const product = await Product.findById(item.product).lean();
          if (!product) {
            throw new Error(`Product not found: ${item.name}`);
          }
          
          // SECURITY: Use database price, not client-provided price
          // This prevents price manipulation attacks
          validatedItem.product = item.product;
          validatedItem.name = product.name; // Use canonical name from database
          validatedItem.price = product.price; // Use current database price
        } catch (dbError) {
          // Handle database errors (network issues, invalid ObjectId, etc.)
          if (dbError.message.includes('Product not found')) {
            throw dbError; // Re-throw our custom error
          }
          throw new Error(`Database error validating product ${item.name}: ${dbError.message}`);
        }
      } else {
        // For manual items without product IDs, validate price reasonableness
        if (item.price <= 0 || item.price > 10000) {
          throw new Error(`Invalid price for ${item.name}: ${item.price}`);
        }
        validatedItem.price = item.price;
      }
      
      // Add validated item and update running total
      validatedItems.push(validatedItem);
      recalculatedTotal += validatedItem.price * validatedItem.quantity;
    }
    
    return { validatedItems, recalculatedTotal };
    
  } catch (error) {
    // Wrap any unexpected errors with context
    if (error.message.includes('Invalid cart item') || 
        error.message.includes('Duplicate product') || 
        error.message.includes('Invalid quantity') || 
        error.message.includes('Product not found') ||
        error.message.includes('Invalid price')) {
      throw error; // Re-throw our custom validation errors
    }
    
    // Log unexpected errors for debugging
    console.error('Unexpected error in validateAndRecalculateCart:', error);
    throw new Error('Cart validation failed due to server error');
  }
}

/**
 * CART SYNCHRONIZATION ENDPOINT - POST /api/cart/sync
 * 
 * ISSUE FIXED: Session initialization bug
 * PROBLEM: If session didn't exist, cart sync would fail silently
 * SOLUTION: Ensure session exists before accessing session.cart
 * 
 * This endpoint synchronizes client-side cart (localStorage) with server-side
 * session cart. This is crucial for maintaining cart state across requests
 * and enabling server-side cart validation.
 * 
 * WHY SESSIONS ARE USED FOR CART:
 * 1. Persistence - Cart survives page refreshes and navigation
 * 2. Server validation - Server can validate cart before checkout
 * 3. Security - Server controls cart contents, not just client
 * 4. Cross-tab sync - Multiple tabs share same cart
 * 5. Checkout protection - Middleware can check cart exists
 * 
 * CART CLEANING FEATURES:
 * - Removes invalid items (missing required fields)
 * - Merges duplicate products by summing quantities
 * - Ensures quantities are positive integers
 * - Validates against database prices
 */
app.post('/api/cart/sync', async (req, res) => {
  try {
    // BUGFIX: Ensure session exists before accessing properties
    if (!req.session) {
      return res.status(500).json({ error: 'Session not initialized' });
    }
    
    const cart = req.body && req.body.cart;
    if (!Array.isArray(cart)) {
      return res.status(400).json({ error: 'cart must be an array' });
    }
    
    // CART CLEANING ALGORITHM
    const cleanedCart = [];
    const seenProducts = new Set(); // Track products to prevent duplicates
    
    for (const item of cart) {
      // Skip items with missing required fields
      if (!item.name || !item.quantity || !item.price) {
        continue; // Invalid items are silently removed
      }
      
      // Create unique key for duplicate detection
      const productKey = item.product ? item.product.toString() : item.name;
      
      // DUPLICATE HANDLING: Merge quantities instead of having duplicates
      if (seenProducts.has(productKey)) {
        const existingItem = cleanedCart.find(cartItem => 
          (cartItem.product ? cartItem.product.toString() : cartItem.name) === productKey
        );
        if (existingItem) {
          existingItem.quantity += item.quantity;
        }
      } else {
        seenProducts.add(productKey);
        cleanedCart.push({
          ...item,
          quantity: Math.max(1, Math.floor(item.quantity)) // Ensure positive integer
        });
      }
    }
    
    // BUGFIX: Initialize session.cart if it doesn't exist
    if (!req.session.cart) {
      req.session.cart = [];
    }
    
    // Store cleaned cart in session
    req.session.cart = cleanedCart;
    
    // Validate cart against database and recalculate total
    let recalculatedTotal = 0;
    if (cleanedCart.length > 0) {
      try {
        const validation = await validateAndRecalculateCart(cleanedCart);
        recalculatedTotal = validation.recalculatedTotal;
      } catch (validationError) {
        // If validation fails, still sync cart but warn about issues
        console.warn('Cart validation warning during sync:', validationError.message);
        // Calculate total from client data as fallback
        recalculatedTotal = cleanedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      }
    }
    
    return res.json({ 
      ok: true, 
      cart: cleanedCart, 
      total: recalculatedTotal,
      message: cleanedCart.length !== cart.length ? 'Cart cleaned: duplicates merged' : undefined
    });
    
  } catch (err) {
    console.error('Cart sync error', err);
    return res.status(500).json({ error: 'Could not sync cart' });
  }
});

// Cart validation endpoint - checks for deleted products and recalculates totals
app.post('/api/cart/validate', async (req, res) => {
  try {
    const cart = req.body && req.body.cart;
    if (!Array.isArray(cart)) {
      return res.status(400).json({ error: 'cart must be an array' });
    }
    
    const validatedCart = [];
    const removedItems = [];
    const updatedItems = [];
    let recalculatedTotal = 0;
    
    for (const item of cart) {
      if (!item.name || !item.quantity || !item.price) {
        removedItems.push({ ...item, reason: 'Invalid item data' });
        continue;
      }
      
      // If product has an ID, check if it still exists
      if (item.product) {
        const product = await Product.findById(item.product).lean();
        if (!product) {
          removedItems.push({ ...item, reason: 'Product no longer available' });
          continue;
        }
        
        // Check if price has changed
        if (Math.abs(product.price - item.price) > 0.01) {
          updatedItems.push({
            ...item,
            oldPrice: item.price,
            newPrice: product.price,
            reason: 'Price updated'
          });
          item.price = product.price;
        }
        
        // Update name if it changed
        if (product.name !== item.name) {
          item.name = product.name;
        }
      }
      
      validatedCart.push(item);
      recalculatedTotal += item.price * item.quantity;
    }
    
    return res.json({
      validatedCart,
      recalculatedTotal,
      removedItems,
      updatedItems,
      hasChanges: removedItems.length > 0 || updatedItems.length > 0
    });
  } catch (err) {
    console.error('Cart validation error', err);
    return res.status(500).json({ error: 'Could not validate cart' });
  }
});

// Server-side validation functions
function validateOrderData(data) {
  const errors = [];
  
  // Customer name validation
  if (!data.customerName || typeof data.customerName !== 'string' || data.customerName.trim().length < 3) {
    errors.push('Customer name is required and must be at least 3 characters');
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || !emailRegex.test(data.email)) {
    errors.push('Valid email address is required');
  }
  
  // Phone validation (if provided)
  if (data.phone) {
    const phoneRegex = /^\d{10,}$/;
    if (!phoneRegex.test(data.phone.replace(/\D/g, ''))) {
      errors.push('Phone must contain at least 10 digits');
    }
  }
  
  // Address validation (if provided)
  if (data.address && data.address.trim().length === 0) {
    errors.push('Address cannot be empty if provided');
  }
  
  // City validation (if provided)
  if (data.city && data.city.trim().length === 0) {
    errors.push('City cannot be empty if provided');
  }
  
  // Postal code validation (if provided)
  if (data.postalCode) {
    const postalRegex = /^\d{4,6}$/;
    if (!postalRegex.test(data.postalCode)) {
      errors.push('Postal code must be 4-6 digits');
    }
  }
  
  // Payment method validation (if provided)
  if (data.paymentMethod && !['card', 'paypal', 'bank'].includes(data.paymentMethod)) {
    errors.push('Invalid payment method');
  }
  
  // Card validation (if card payment selected)
  if (data.paymentMethod === 'card') {
    if (!data.cardName || data.cardName.trim().length === 0) {
      errors.push('Cardholder name is required for card payments');
    }
    
    if (!data.cardNumber || !/^\d{16}$/.test(data.cardNumber.replace(/\s/g, ''))) {
      errors.push('Card number must be 16 digits');
    }
    
    if (!data.cardExpiry || !/^\d{2}\/\d{2}$/.test(data.cardExpiry)) {
      errors.push('Card expiry must be in MM/YY format');
    }
    
    if (!data.cardCVV || !/^\d{3}$/.test(data.cardCVV)) {
      errors.push('CVV must be 3 digits');
    }
  }
  
  return errors;
}

/**
 * ORDER CREATION API ENDPOINT - POST /api/orders
 * 
 * This is the most critical endpoint in the e-commerce system. It handles the complete
 * order creation process with multiple layers of validation and security checks.
 * 
 * MIDDLEWARE CHAIN:
 * 1. checkCartNotEmpty - Ensures cart has items before processing
 * 2. This handler - Validates, processes, and creates the order
 * 
 * SECURITY FEATURES:
 * - Server-side form validation (prevents client-side bypass)
 * - Cart total recalculation (prevents price manipulation)
 * - Product existence verification (handles deleted products)
 * - Duplicate prevention in cart items
 * - Session-based cart management
 * 
 * PROCESS FLOW:
 * 1. Extract and validate basic payload structure
 * 2. Run comprehensive form validation (name, email, payment details)
 * 3. Validate cart items against database (security-critical)
 * 4. Recalculate total using database prices (prevents tampering)
 * 5. Compare client vs server totals (detect manipulation attempts)
 * 6. Create order in database with validated data
 * 7. Clear session cart (prevent duplicate orders)
 * 8. Return order confirmation
 * 
 * @route POST /api/orders
 * @middleware checkCartNotEmpty
 * @body {string} customerName - Customer's full name (min 3 chars)
 * @body {string} email - Valid email address
 * @body {Array} items - Cart items with product IDs, names, quantities, prices
 * @body {number} totalAmount - Client-calculated total (will be verified)
 * @body {Object} ...additionalData - Optional: phone, address, payment details
 * @returns {Object} { orderId: string, total: number } - Success response
 * @returns {Object} { error: string, details?: Array } - Error response
 */
app.post('/api/orders', checkCartNotEmpty, async (req, res) => {
  try {
    // STEP 1: Extract and destructure request data
    const { customerName, email, items, totalAmount, ...additionalData } = req.body;
    
    // STEP 2: Basic payload structure validation
    // This catches malformed requests early before expensive operations
    if (!customerName || !email || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid order payload' });
    }
    
    // STEP 3: Comprehensive form validation
    // Validates all customer data, payment details, etc.
    const validationErrors = validateOrderData({ customerName, email, ...additionalData });
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }
    
    // STEP 4: SECURITY-CRITICAL - Validate cart against database
    // This prevents price manipulation, handles deleted products, prevents duplicates
    const { validatedItems, recalculatedTotal } = await validateAndRecalculateCart(items);
    
    // STEP 5: Total verification - detect client-side price manipulation
    // Small tolerance accounts for floating-point precision differences
    const tolerance = 0.01;
    if (Math.abs(recalculatedTotal - totalAmount) > tolerance) {
      return res.status(400).json({ 
        error: 'Total amount mismatch', 
        clientTotal: totalAmount,
        serverTotal: recalculatedTotal,
        message: 'Cart total has been recalculated. Please refresh and try again.'
      });
    }

    // STEP 6: Create order in database with validated data
    // Use server-calculated total and validated items, not client data
    const order = await Order.create({ 
      customerName: customerName.trim(), 
      email: email.toLowerCase().trim(), // Normalize email
      items: validatedItems, // Use server-validated items
      totalAmount: recalculatedTotal // Use server-calculated total
    });

    // STEP 7: Clear session cart to prevent duplicate orders
    // This is why we use sessions - to maintain cart state across requests
    req.session.cart = [];

    // STEP 8: Return success response with order ID for confirmation page
    res.status(201).json({ orderId: order._id, total: recalculatedTotal });
    
  } catch (err) {
    // COMPREHENSIVE ERROR HANDLING
    console.error('Create order error', err);
    
    // Handle validation errors (client should see these)
    if (err.message.includes('Product not found') || 
        err.message.includes('Invalid cart') ||
        err.message.includes('Duplicate product')) {
      return res.status(400).json({ error: err.message });
    }
    
    // Handle unexpected server errors (don't expose internal details)
    res.status(500).json({ error: 'Could not create order' });
  }
});

// Admin login (small helper to set session userEmail) - POST { email }
app.post('/admin/login', (req, res) => {
  const email = req.body && req.body.email;
  if (!email) return res.status(400).send('Email required');
  req.session.userEmail = email;
  return res.redirect('/admin');
});

// Admin login page (GET)
app.get('/admin/login', (req, res) => {
  // If already logged in as admin, redirect to dashboard
  if (req.session && req.session.userEmail === 'admin@shop.com') return res.redirect('/admin');
  return res.render('admin_login');
});

// Order confirmation page
app.get('/order-confirmation/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).send('Order not found');
    res.render('order_confirmation', { order });
  } catch (err) {
    console.error('Order confirmation error', err);
    res.status(500).send('Server error');
  }
});

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

// ------------------ Admin routes (simple, server-rendered) ------------------
// Admin dashboard (protected)
app.get('/admin', adminOnly, (req, res) => {
  res.render('admin/dashboard');
});

// Admin: product list
app.get('/admin/products', adminOnly, async (req, res) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 }).lean();
    res.render('admin/products', { products });
  } catch (err) {
    console.error('Admin products error', err);
    res.status(500).send('Server error');
  }
});

// Admin: new product form
app.get('/admin/products/new', adminOnly, (req, res) => {
  res.render('admin/product_form', { product: null, action: '/admin/products', method: 'POST' });
});

// Admin: create product
app.post('/admin/products', adminOnly, async (req, res) => {
  try {
    const { name, price, category, image, description } = req.body;
    await Product.create({ name, price: parseFloat(price) || 0, category, image, description });
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Create product error', err);
    res.status(500).send('Create failed');
  }
});

// Admin: edit form
app.get('/admin/products/:id/edit', adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).send('Not found');
    res.render('admin/product_form', { product, action: `/admin/products/${product._id}`, method: 'POST' });
  } catch (err) {
    console.error('Edit product error', err);
    res.status(500).send('Server error');
  }
});

// Admin: update product
app.post('/admin/products/:id', adminOnly, async (req, res) => {
  try {
    const { name, price, category, image, description } = req.body;
    await Product.findByIdAndUpdate(req.params.id, { name, price: parseFloat(price) || 0, category, image, description });
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Update product error', err);
    res.status(500).send('Update failed');
  }
});

// Admin: delete product
app.post('/admin/products/:id/delete', adminOnly, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Delete product error', err);
    res.status(500).send('Delete failed');
  }
});

// Admin: orders list
app.get('/admin/orders', adminOnly, async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
    res.render('admin/orders', { orders });
  } catch (err) {
    console.error('Admin orders error', err);
    res.status(500).send('Server error');
  }
});

// Admin: mark order as confirmed
app.post('/admin/orders/:id/confirm', adminOnly, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'Confirmed' });
    res.redirect('/admin/orders');
  } catch (err) {
    console.error('Confirm order error', err);
    res.status(500).send('Update failed');
  }
});

// Admin: cancel order
app.post('/admin/orders/:id/cancel', adminOnly, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'Cancelled' });
    res.redirect('/admin/orders');
  } catch (err) {
    console.error('Cancel order error', err);
    res.status(500).send('Update failed');
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
