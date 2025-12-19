// Reusable middleware: checkCartNotEmpty and adminOnly

function checkCartNotEmpty(req, res, next) {
  try {
    // Accept cart from request body (items) or from session (req.session.cart)
    const items = (req.body && req.body.items) || (req.session && req.session.cart);
    if (!items || !Array.isArray(items) || items.length === 0) {
      // For HTML requests, redirect to a friendly cart-empty page
      if (req.accepts && req.accepts('html')) {
        return res.redirect('/cart-empty');
      }
      return res.status(400).json({ error: 'Cart is empty. Add items before checking out.' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error in cart check' });
  }
}

/**
 * ADMIN-ONLY MIDDLEWARE
 * 
 * This middleware demonstrates the power of middleware pattern in Express.js.
 * Instead of repeating authentication logic in every admin route, we centralize
 * it here and apply it to all admin routes that need protection.
 * 
 * WHY MIDDLEWARE IS PREFERRED OVER REPEATED LOGIC:
 * 1. DRY Principle - Write once, use everywhere
 * 2. Consistency - Same auth logic across all admin routes
 * 3. Maintainability - Change auth logic in one place
 * 4. Security - Harder to forget protection on new routes
 * 5. Testability - Test auth logic once, not in every route
 * 
 * AUTHENTICATION METHODS SUPPORTED:
 * 1. Session-based (req.session.userEmail) - Persistent across requests
 * 2. Header-based (x-user-email) - For API clients and testing
 * 3. Query parameter (email=admin@shop.com) - For quick testing/debugging
 * 
 * RESPONSE HANDLING:
 * - HTML requests: Redirect to login page (user-friendly)
 * - API requests: Return 403 JSON (machine-readable)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next middleware function
 * @returns {void} - Calls next() if authorized, sends response if not
 */
function adminOnly(req, res, next) {
  // CONFIGURATION: Admin email (in production, this would be from environment)
  const adminEmail = 'admin@shop.com';
  
  // MULTI-METHOD AUTHENTICATION CHECK
  // Check session first (most secure, persistent)
  const fromSession = req.session && req.session.userEmail;
  // Check custom header (useful for API clients)
  const fromHeader = req.headers['x-user-email'];
  // Check query parameter (convenient for testing, less secure)
  const fromQuery = req.query && req.query.email;

  // AUTHORIZATION LOGIC
  // If any method provides the correct admin email, grant access
  if (fromSession === adminEmail || fromHeader === adminEmail || fromQuery === adminEmail) {
    // MIDDLEWARE PATTERN: Call next() to continue to the actual route handler
    return next();
  }

  // UNAUTHORIZED ACCESS HANDLING
  // Different responses based on client type (content negotiation)
  
  // For browser requests (HTML), redirect to login page
  // This provides a better user experience than showing an error
  if (req.accepts && req.accepts('html')) {
    return res.redirect('/admin/login');
  }

  // For API clients (JSON), return structured error response
  // This allows programmatic handling of authentication failures
  return res.status(403).json({ error: 'Forbidden - admin only' });
}

module.exports = { checkCartNotEmpty, adminOnly };
