// Load environment variables from .env when available (optional)
try {
    require('dotenv').config();
} catch (e) {
    // dotenv not installed or failed to load - proceed with existing environment
}

const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
