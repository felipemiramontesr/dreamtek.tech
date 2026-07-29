"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const health_js_1 = require("./routes/health.js");
const auth_js_1 = require("./routes/auth.js");
const onboarding_js_1 = require("./routes/onboarding.js");
const checkout_js_1 = require("./routes/checkout.js");
const client_js_1 = require("./routes/client.js");
const admin_js_1 = require("./routes/admin.js");
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// CORS setup
const allowedOrigins = [
    'http://localhost:3000',
    'https://dreamtek.tech',
    'https://www.dreamtek.tech',
];
if (process.env.CORS_ORIGIN) {
    allowedOrigins.push(process.env.CORS_ORIGIN);
}
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(null, true);
        }
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Subruta principal del API
app.use('/api/v1', health_js_1.healthRouter);
app.use('/api/v1/auth', auth_js_1.authRouter);
app.use('/api/v1/onboarding', onboarding_js_1.onboardingRouter);
app.use('/api/v1/checkout', checkout_js_1.checkoutRouter);
app.use('/api/v1/client', client_js_1.clientRouter);
app.use('/api/v1/admin', admin_js_1.adminRouter);
app.listen(PORT, () => {
    console.log(`🚀 Dreamtek Node.js API Server running on port ${PORT}`);
});
exports.default = app;
