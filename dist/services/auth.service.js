"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_constants_1 = require("../constants/auth.constants");
const user_model_1 = __importDefault(require("../models/user.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const registerUser = async (email, password) => {
    if (!email) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Email is required.');
    }
    if (!password) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Password is required.');
    }
    if (password.length < auth_constants_1.MIN_PASSWORD_LENGTH) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Password must be at least ${auth_constants_1.MIN_PASSWORD_LENGTH} characters.`);
    }
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await user_model_1.default.findUserByEmail(normalizedEmail);
    if (existingUser) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Email already exists.');
    }
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    const user = await user_model_1.default.createUser(normalizedEmail, hashedPassword);
    return user;
};
const authService = {
    registerUser,
};
exports.default = authService;
