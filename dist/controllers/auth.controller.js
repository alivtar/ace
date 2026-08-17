"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_service_1 = __importDefault(require("../services/auth.service"));
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const register = (0, catchAsync_1.default)(async (req, res) => {
    const { email, password } = req.body;
    const user = await auth_service_1.default.registerUser(email, password);
    res.status(http_status_1.default.CREATED).json({
        success: true,
        user,
    });
});
const authController = {
    register,
};
exports.default = authController;
