const jwt = require("jsonwebtoken");

function authorize(req, res, next) {
  // 1. Get the token from the request header
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1]; // The token is in the format "Bearer <token>"

  // 2. If no token is found, send an Unauthorized error
  if (!token) {
    return res.status(401).json({ ok: false, error: "Access denied. No token provided." });
  }

  try {
    // 3. Verify the token is valid using your JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. If it's valid, attach the decoded payload (e.g., user id and username) to the request object
    req.user = decoded;
    console.log("[authorize] decoded:", decoded);

    // 5. Call next() to pass control to the next function in the chain (the actual route handler)
    next();
  } catch (ex) {
    // 6. If the token is invalid, send an error
    res.status(400).json({ ok: false, error: "Invalid token." });
  }
}

module.exports = authorize;